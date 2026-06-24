const express = require('express');
const mime = require('mime-types');
const { spawn } = require('child_process');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const { authenticateToken } = require('../middleware/auth');
const {
  createSmbClient,
  smbReaddir,
  smbStat,
  smbCreateReadStream,
  smbMkdir,
  smbUnlink,
  smbRmdir,
  smbRename,
  smbCreateWriteStream,
  formatFileSize,
  detectFileType,
  normalizeSmbPath,
} = require('../utils/smb');
const Busboy = require('busboy');

const router = express.Router();

// Semua route di bawah butuh autentikasi
router.use(authenticateToken);

// ============================================================
// THUMBNAIL CACHE — simpan buffer di memory, max 200 item
// Cegah fetch ulang thumbnail yang sama berkali-kali
// ============================================================
const thumbnailCache = new Map(); // key: filePath, value: { buf, mimeType, ts }
const CACHE_MAX = 200;
const CACHE_TTL = 10 * 60 * 1000; // 10 menit

const getCachedThumbnail = (key) => {
  const entry = thumbnailCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) {
    thumbnailCache.delete(key);
    return null;
  }
  return entry;
};

const setCachedThumbnail = (key, buf, mimeType) => {
  if (thumbnailCache.size >= CACHE_MAX) {
    // Hapus entry paling lama
    const firstKey = thumbnailCache.keys().next().value;
    thumbnailCache.delete(firstKey);
  }
  thumbnailCache.set(key, { buf, mimeType, ts: Date.now() });
};

// ============================================================
// CONCURRENCY LIMITER — batasi berapa banyak stat SMB parallel
// Cegah flood ke SMB server saat folder besar
// ============================================================
const pLimit = (limit) => {
  let active = 0;
  const queue = [];
  const run = async (fn, resolve, reject) => {
    active++;
    try { resolve(await fn()); } catch (e) { reject(e); }
    finally {
      active--;
      if (queue.length > 0) {
        const next = queue.shift();
        run(next.fn, next.resolve, next.reject);
      }
    }
  };
  return (fn) => new Promise((resolve, reject) => {
    if (active < limit) run(fn, resolve, reject);
    else queue.push({ fn, resolve, reject });
  });
};

const statLimit = pLimit(5); // max 5 stat SMB concurrent

/**
 * Helper: buat SMB2 client dari data user di token
 */
const getSmbFromToken = (user) => {
  return createSmbClient({
    host: user.host,
    share: user.share,
    username: user.username,
    password: user.password,
    domain: user.domain || 'WORKGROUP',
  });
};

/**
 * GET /api/files/list?path=/some/dir
 * List isi folder di SMB2 share
 */
router.get('/list', async (req, res) => {
  try {
    const rawPath = req.query.path || '/';
    const dirPath = normalizeSmbPath(rawPath);

    const smb = getSmbFromToken(req.user);
    const entries = await smbReaddir(smb, dirPath);

    // Filter file/folder system tersembunyi
    const filtered = entries.filter(name =>
      !name.startsWith('.') &&
      name.toLowerCase() !== 'desktop.ini' &&
      name.toLowerCase() !== 'thumbs.db' &&
      name.toLowerCase() !== 'system volume information'
    );

    // Ambil stat untuk setiap entry — dibatasi max 5 concurrent
    const fileResults = await Promise.all(
      filtered.map(name => statLimit(async () => {
        const entryPath = dirPath ? `${dirPath}\\${name}` : name;
        let isDir = false;
        let size = null;
        let modifiedAt = null;

        try {
          const stat = await smbStat(smb, entryPath);
          isDir = stat.isDirectory();
          size = isDir ? null : stat.size;
          modifiedAt = stat.mtime ? new Date(stat.mtime).toISOString() : null;
        } catch (_) {
          // Kalau stat gagal, coba readdir — kalau bisa dibuka = folder
          try {
            await smbReaddir(smb, entryPath);
            isDir = true;
          } catch (_2) {
            isDir = false;
          }
        }

        const displayPath = '/' + entryPath.replace(/\\/g, '/');

        return {
          name,
          type: detectFileType(name, isDir),
          isDirectory: isDir,
          size,
          sizeFormatted: size !== null ? formatFileSize(size) : null,
          modifiedAt,
          path: displayPath,
        };
      }))
    );

    // Sort: folder dulu, lalu file, alphabetical
    fileResults.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });

    res.json({
      success: true,
      path: '/' + (dirPath ? dirPath.replace(/\\/g, '/') : ''),
      files: fileResults,
      total: fileResults.length,
    });

  } catch (err) {
    console.error('[FILES] List error:', err.message);
    if (err.code === 'STATUS_NO_SUCH_FILE' || err.code === 'STATUS_OBJECT_NAME_NOT_FOUND') {
      return res.status(404).json({ error: 'Folder tidak ditemukan' });
    }
    res.status(500).json({ error: 'Gagal membaca isi folder: ' + err.message });
  }
});

const TRANSCODE_EXTENSIONS = ['.mpeg', '.mpg', '.mkv', '.avi', '.ts', '.wmv', '.flv', '.3gp'];

const isTranscodingNeeded = (filename) => {
  if (!filename) return false;
  const ext = '.' + filename.split('.').pop()?.toLowerCase();
  return TRANSCODE_EXTENSIONS.includes(ext);
};

/**
 * GET /api/files/stream?path=/path/to/file
 * Stream file dari SMB2 share (untuk foto, video, dll)
 */
router.get('/stream', async (req, res) => {
  try {
    const rawPath = req.query.path;
    if (!rawPath) {
      return res.status(400).json({ error: 'Parameter path diperlukan' });
    }
    const filePath = normalizeSmbPath(rawPath);

    const smb = getSmbFromToken(req.user);

    // Ambil info file
    let stat;
    try {
      stat = await smbStat(smb, filePath);
    } catch (err) {
      return res.status(404).json({ error: 'File tidak ditemukan' });
    }

    const fileSize = stat.size;
    const filename = filePath.split('\\').pop();
    const needsTranscoding = isTranscodingNeeded(filename);
    let mimeType = needsTranscoding ? 'video/mp4' : (mime.lookup(filename) || 'application/octet-stream');

    // Override video/mpeg atau video/mpg menjadi video/mp4 agar browser dapat memutar videonya
    if (filename.toLowerCase().endsWith('.mpeg') || filename.toLowerCase().endsWith('.mpg')) {
      mimeType = 'video/mp4';
    }

    // Jalankan transcoding H.264 real-time jika format video tidak didukung browser
    if (needsTranscoding) {
      console.log(`[STREAM] Transcoding file: ${filename} on-the-fly to Fragmented MP4`);
      
      res.writeHead(200, {
        'Content-Type': 'video/mp4',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache',
      });

      const fs = require('fs');
      const path = require('path');
      const logFile = path.join(__dirname, '../ffmpeg.log');
      try {
        fs.writeFileSync(logFile, `=== TRANSCODE START: ${filename} ===\n`);
      } catch (_) {}

      const smbStream = await smbCreateReadStream(smb, filePath);
      const ffmpeg = spawn(ffmpegPath, [
        '-i', 'pipe:0',                          // Input dari stdin
        '-vcodec', 'libx264',                     // Video H.264
        '-preset', 'ultrafast',                  // Preset tercepat & hemat CPU
        '-tune', 'zerolatency',                  // Zero delay
        '-acodec', 'aac',                        // Audio AAC
        '-b:a', '128k',                          // Audio bitrate
        '-f', 'mp4',                             // Container format MP4
        '-movflags', 'frag_keyframe+empty_moov', // Fragmented MP4 agar bisa di-stream
        'pipe:1'                                 // Output ke stdout
      ]);

      try {
        const logStream = fs.createWriteStream(logFile, { flags: 'a' });
        ffmpeg.stderr.pipe(logStream);
      } catch (_) {}

      smbStream.pipe(ffmpeg.stdin);
      ffmpeg.stdout.pipe(res);

      smbStream.on('error', (err) => {
        console.error('[STREAM] SMB stream error:', err.message);
        try { ffmpeg.stdin.end(); } catch (_) {}
      });

      ffmpeg.on('error', (err) => {
        console.error('[STREAM] FFmpeg spawn error:', err.message);
        if (!res.headersSent) res.status(500).end();
      });

      req.on('close', () => {
        console.log(`[STREAM] Client disconnected. Killing FFmpeg for: ${filename}`);
        try { smbStream.destroy(); } catch (_) {}
        try { ffmpeg.kill('SIGKILL'); } catch (_) {}
      });

      return;
    }

    // Handle Range request untuk video streaming
    const range = req.headers.range;
    if (range && mimeType.startsWith('video/')) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': mimeType,
        'Cache-Control': 'no-cache',
      });

      const stream = await smbCreateReadStream(smb, filePath, { start, end });
      stream.on('error', (err) => {
        console.error('[STREAM] Error:', err.message);
        if (!res.headersSent) res.status(500).end();
      });
      stream.pipe(res);

    } else {
      // Full file response
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': mimeType,
        'Content-Disposition': `inline; filename="${encodeURIComponent(filename)}"`,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, max-age=3600',
      });

      const stream = await smbCreateReadStream(smb, filePath);
      stream.on('error', (err) => {
        console.error('[STREAM] Error:', err.message);
        if (!res.headersSent) res.status(500).end();
      });
      stream.pipe(res);
    }

  } catch (err) {
    console.error('[FILES] Stream error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Gagal streaming file: ' + err.message });
    }
  }
});

/**
 * GET /api/files/download?path=/path/to/file
 * Download file dari SMB2 share
 */
router.get('/download', async (req, res) => {
  try {
    const rawPath = req.query.path;
    if (!rawPath) {
      return res.status(400).json({ error: 'Parameter path diperlukan' });
    }
    const filePath = normalizeSmbPath(rawPath);
    const filename = filePath.split('\\').pop();

    const smb = getSmbFromToken(req.user);

    let stat;
    try {
      stat = await smbStat(smb, filePath);
    } catch {
      return res.status(404).json({ error: 'File tidak ditemukan' });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Type', mime.lookup(filename) || 'application/octet-stream');

    const stream = await smbCreateReadStream(smb, filePath);
    stream.pipe(res);

  } catch (err) {
    console.error('[FILES] Download error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Gagal download file: ' + err.message });
    }
  }
});

/**
 * GET /api/files/thumbnail?path=/path/to/image
 * Thumbnail preview dengan in-memory cache
 */
router.get('/thumbnail', async (req, res) => {
  try {
    const rawPath = req.query.path;
    if (!rawPath) return res.status(400).json({ error: 'Parameter path diperlukan' });

    const filePath = normalizeSmbPath(rawPath);
    const filename = filePath.split('\\').pop();
    const mimeType = mime.lookup(filename) || 'application/octet-stream';

    // Cek cache dulu
    const cacheKey = `${req.user.host}|${req.user.share}|${filePath}`;
    const cached = getCachedThumbnail(cacheKey);
    if (cached) {
      res.setHeader('Content-Type', cached.mimeType);
      res.setHeader('Content-Length', cached.buf.length);
      res.setHeader('Cache-Control', 'private, max-age=86400');
      res.setHeader('X-Cache', 'HIT');
      return res.end(cached.buf);
    }

    // Buat client SMB baru
    const smb = getSmbFromToken(req.user);
    const isVideo = mimeType.startsWith('video/');

    if (isVideo) {
      console.log(`[THUMBNAIL] Mengekstrak frame video via HTTP stream untuk: ${filename}`);
      
      const PORT = process.env.PORT || 3001;
      const token = req.query.token || (req.headers.authorization && req.headers.authorization.split(' ')[1]);
      const localStreamUrl = `http://localhost:${PORT}/api/files/stream?path=${encodeURIComponent(filePath)}&token=${token}`;
      
      const ffmpeg = spawn(ffmpegPath, [
        '-ss', '1',              // Seek ke detik ke-1 BEFORE input
        '-i', localStreamUrl,    // Input URL HTTP
        '-vframes', '1',         // Hanya ambil 1 frame
        '-f', 'image2',          // Container format
        '-vcodec', 'mjpeg',      // MJPEG
        '-'                      // Output ke stdout
      ]);

      const imageChunks = [];
      ffmpeg.stdout.on('data', (chunk) => imageChunks.push(chunk));
      
      ffmpeg.on('close', (code) => {
        if (code === 0 && imageChunks.length > 0) {
          const buf = Buffer.concat(imageChunks);
          setCachedThumbnail(cacheKey, buf, 'image/jpeg');
          
          res.setHeader('Content-Type', 'image/jpeg');
          res.setHeader('Content-Length', buf.length);
          res.setHeader('Cache-Control', 'private, max-age=86400');
          res.setHeader('X-Cache', 'MISS');
          return res.end(buf);
        } else {
          console.error(`[THUMBNAIL] FFmpeg selesai dengan kode ${code} (gagal ekstrak frame video)`);
          if (!res.headersSent) res.status(500).end();
        }
      });

      ffmpeg.on('error', (err) => {
        console.error('[THUMBNAIL] FFmpeg spawn error:', err.message);
        if (!res.headersSent) res.status(500).end();
      });

      return;
    }

    // Untuk image/dokumen biasa
    const stream = await smbCreateReadStream(smb, filePath);
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => {
      const buf = Buffer.concat(chunks);
      // Simpan ke cache
      setCachedThumbnail(cacheKey, buf, mimeType);

      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Length', buf.length);
      res.setHeader('Cache-Control', 'private, max-age=86400');
      res.setHeader('X-Cache', 'MISS');
      res.end(buf);
    });
    stream.on('error', (err) => {
      console.error('[THUMBNAIL] Stream error:', err.message);
      if (!res.headersSent) res.status(500).end();
    });

  } catch (err) {
    console.error('[THUMBNAIL] Error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});

/**
 * POST /api/files/mkdir
 * Buat folder baru
 */
router.post('/mkdir', async (req, res) => {
  try {
    const { path, name } = req.body;
    if (!name) return res.status(400).json({ error: 'Nama folder diperlukan' });
    
    const parentPath = normalizeSmbPath(path || '/');
    const folderPath = parentPath ? `${parentPath}\\${name}` : name;
    
    const smb = getSmbFromToken(req.user);
    await smbMkdir(smb, folderPath);
    
    res.json({ success: true, message: `Folder "${name}" berhasil dibuat` });
  } catch (err) {
    console.error('[FILES] Mkdir error:', err.message);
    res.status(500).json({ error: 'Gagal membuat folder: ' + err.message });
  }
});

/**
 * POST /api/files/delete
 * Hapus file atau folder
 */
router.post('/delete', async (req, res) => {
  try {
    const { path } = req.body;
    if (!path) return res.status(400).json({ error: 'Parameter path diperlukan' });
    
    const targetPath = normalizeSmbPath(path);
    const smb = getSmbFromToken(req.user);
    
    // Periksa apakah target folder atau file dengan melakukan stat
    let isDir = false;
    try {
      const stat = await smbStat(smb, targetPath);
      isDir = stat.isDirectory();
    } catch (_) {
      isDir = true;
    }
    
    if (isDir) {
      try {
        await smbRmdir(smb, targetPath);
      } catch (err) {
        await smbUnlink(smb, targetPath);
      }
    } else {
      await smbUnlink(smb, targetPath);
    }
    
    res.json({ success: true, message: 'File/Folder berhasil dihapus' });
  } catch (err) {
    console.error('[FILES] Delete error:', err.message);
    res.status(500).json({ error: 'Gagal menghapus file/folder: ' + err.message });
  }
});

/**
 * POST /api/files/rename
 * Ubah nama file/folder
 */
router.post('/rename', async (req, res) => {
  try {
    const { path, newName } = req.body;
    if (!path || !newName) {
      return res.status(400).json({ error: 'Parameter path dan newName diperlukan' });
    }
    
    const oldPath = normalizeSmbPath(path);
    const parts = oldPath.split('\\');
    parts.pop(); // Hapus nama file lama
    parts.push(newName); // Masukkan nama file baru
    const newPath = parts.join('\\');
    
    const smb = getSmbFromToken(req.user);
    await smbRename(smb, oldPath, newPath);
    
    res.json({ success: true, message: 'Berhasil mengubah nama' });
  } catch (err) {
    console.error('[FILES] Rename error:', err.message);
    res.status(500).json({ error: 'Gagal mengubah nama: ' + err.message });
  }
});

/**
 * POST /api/files/upload-stream?path=/folder/path
 * Upload file via raw binary stream — tidak ada multipart overhead
 * Filename diambil dari header X-Filename, path dari query string
 * Frontend kirim file langsung sebagai request body (Content-Type: application/octet-stream)
 */
router.post('/upload-stream', async (req, res) => {
  try {
    const rawPath = req.query.path || '/';
    const rawFilename = req.headers['x-filename'];
    if (!rawFilename) {
      return res.status(400).json({ error: 'Header X-Filename diperlukan' });
    }
    
    // Decode filename dari UTF-8 URI encoding
    let filename;
    try {
      filename = decodeURIComponent(rawFilename);
    } catch (_) {
      filename = rawFilename;
    }
    
    const parentPath = normalizeSmbPath(rawPath);
    const destPath = parentPath ? `${parentPath}\\${filename}` : filename;
    
    console.log(`[UPLOAD] Streaming binary upload: ${filename} -> ${destPath}`);
    
    const smb = getSmbFromToken(req.user);
    const writeStream = await smbCreateWriteStream(smb, destPath);
    
    // Pipe request body langsung ke SMB write stream
    await new Promise((resolve, reject) => {
      let finished = false;
      
      const cleanup = (err) => {
        if (finished) return;
        finished = true;
        if (err) reject(err);
        else resolve();
      };
      
      writeStream.on('finish', () => cleanup(null));
      writeStream.on('error', (err) => {
        console.error('[UPLOAD] SMB write error:', err.message);
        try { req.destroy(); } catch (_) {}
        cleanup(err);
      });
      
      req.on('error', (err) => {
        console.error('[UPLOAD] Request stream error:', err.message);
        try { writeStream.destroy(); } catch (_) {}
        cleanup(err);
      });
      
      req.on('aborted', () => {
        console.warn('[UPLOAD] Request aborted by client');
        try { writeStream.destroy(); } catch (_) {}
        cleanup(new Error('Upload dibatalkan oleh klien'));
      });
      
      req.pipe(writeStream);
    });
    
    console.log(`[UPLOAD] Selesai: ${filename}`);
    res.json({ success: true, message: `File "${filename}" berhasil diunggah` });
    
  } catch (err) {
    console.error('[UPLOAD] Error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Gagal mengunggah file: ' + err.message });
    }
  }
});


// Map untuk melacak proses transcoding aktif
const activeTranscodes = new Map(); // key: fileHash, value: { progress: number, process: ChildProcess }

/**
 * GET /api/files/transcode-status
 * Mengecek dan memicu transcoding video di latar belakang
 */
router.get('/transcode-status', async (req, res) => {
  try {
    const rawPath = req.query.path;
    const startTranscode = req.query.start === 'true';
    if (!rawPath) return res.status(400).json({ error: 'Parameter path diperlukan' });

    const filePath = normalizeSmbPath(rawPath);
    const filename = filePath.split('\\').pop();
    
    // Hitung MD5 dari path file untuk nama file unik
    const crypto = require('crypto');
    const fs = require('fs');
    const path = require('path');
    
    const fileHash = crypto.createHash('md5').update(filePath).digest('hex');
    const tempDir = path.join(__dirname, '../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const finalPath = path.join(tempDir, `${fileHash}.mp4`);
    
    // 1. Jika file sudah selesai di-transcode
    if (fs.existsSync(finalPath) && !activeTranscodes.has(fileHash)) {
      return res.json({ status: 'ready', progress: 100 });
    }

    // 2. Jika proses sedang berjalan
    if (activeTranscodes.has(fileHash)) {
      return res.json({
        status: 'processing',
        progress: activeTranscodes.get(fileHash).progress
      });
    }

    // 3. Jika proses belum berjalan, dan dipicu untuk mulai
    if (startTranscode) {
      console.log(`[TRANSCODE] Memulai transcode latar belakang untuk: ${filename}`);
      
      const smb = getSmbFromToken(req.user);
      const tempPath = path.join(tempDir, `${fileHash}_temp.mp4`);
      
      const smbStream = await smbCreateReadStream(smb, filePath);
      const ffmpeg = spawn(ffmpegPath, [
        '-i', 'pipe:0',
        '-vcodec', 'libx264',
        '-preset', 'ultrafast',
        '-tune', 'zerolatency',
        '-acodec', 'aac',
        '-b:a', '128k',
        '-y',
        tempPath
      ]);

      // Catat log stderr ke file diagnostics
      const logFile = path.join(tempDir, `${fileHash}_ffmpeg.log`);
      const logStream = fs.createWriteStream(logFile);
      ffmpeg.stderr.pipe(logStream);

      // Track progress
      let durationSec = 0;
      const transcodeObj = { progress: 0, process: ffmpeg };
      activeTranscodes.set(fileHash, transcodeObj);

      ffmpeg.stderr.on('data', (data) => {
        const text = data.toString();
        // Parse Duration: 00:02:47.25
        const durationMatch = text.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
        if (durationMatch) {
          const hours = parseInt(durationMatch[1], 10);
          const minutes = parseInt(durationMatch[2], 10);
          const seconds = parseFloat(durationMatch[3]);
          durationSec = hours * 3600 + minutes * 60 + seconds;
        }
        
        // Parse time=00:01:15.30
        const timeMatch = text.match(/time=\s*(\d+):(\d+):(\d+\.\d+)/);
        if (timeMatch && durationSec > 0) {
          const hours = parseInt(timeMatch[1], 10);
          const minutes = parseInt(timeMatch[2], 10);
          const seconds = parseFloat(timeMatch[3]);
          const currentSec = hours * 3600 + minutes * 60 + seconds;
          transcodeObj.progress = Math.min(99, Math.round((currentSec / durationSec) * 100));
        }
      });

      smbStream.pipe(ffmpeg.stdin);

      smbStream.on('error', (err) => {
        console.error(`[TRANSCODE] SMB stream error untuk ${filename}:`, err.message);
        try { ffmpeg.stdin.end(); } catch (_) {}
      });

      ffmpeg.on('close', (code) => {
        console.log(`[TRANSCODE] FFmpeg selesai dengan kode ${code} untuk: ${filename}`);
        activeTranscodes.delete(fileHash);
        try { smbStream.destroy(); } catch (_) {}
        
        if (code === 0 && fs.existsSync(tempPath)) {
          fs.renameSync(tempPath, finalPath);
          console.log(`[TRANSCODE] Video sukses disimpan ke cache disk: ${fileHash}.mp4`);
          // Bersihkan file log sementara
          try { fs.unlinkSync(logFile); } catch (_) {}
        } else {
          // Gagal, hapus file sementara
          try { fs.unlinkSync(tempPath); } catch (_) {}
        }
      });

      return res.json({ status: 'processing', progress: 0 });
    }

    // 4. Jika belum dipicu (idle)
    return res.json({ status: 'idle', progress: 0 });

  } catch (err) {
    console.error('[TRANSCODE] Gagal cek transcode-status:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/files/stream-transcoded?path=/path/to/file
 * Mengalirkan file hasil transcoding dengan dukungan Range (206 Partial Content) penuh dari Express
 */
router.get('/stream-transcoded', async (req, res) => {
  try {
    const rawPath = req.query.path;
    if (!rawPath) return res.status(400).json({ error: 'Parameter path diperlukan' });

    const filePath = normalizeSmbPath(rawPath);
    const filename = filePath.split('\\').pop();
    
    const crypto = require('crypto');
    const fs = require('fs');
    const path = require('path');
    
    const fileHash = crypto.createHash('md5').update(filePath).digest('hex');
    const tempFilePath = path.join(__dirname, '../temp', `${fileHash}.mp4`);

    if (fs.existsSync(tempFilePath)) {
      // Set header yang ramah untuk streaming video
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}.mp4"`);
      // sendFile Express secara otomatis menangani Range header dan 206 Partial Content
      return res.sendFile(tempFilePath);
    } else {
      return res.status(404).json({ error: 'Video transcode belum siap atau tidak ditemukan.' });
    }
  } catch (err) {
    console.error('[STREAM-TRANSCODED] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
