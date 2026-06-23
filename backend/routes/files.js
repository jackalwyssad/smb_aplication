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
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

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
 * POST /api/files/upload
 * Upload file (foto, video, dll)
 */
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Tidak ada file yang diunggah' });
    
    const path = req.body.path || '/';
    const parentPath = normalizeSmbPath(path);
    const filename = req.file.originalname;
    const destPath = parentPath ? `${parentPath}\\${filename}` : filename;
    
    const smb = getSmbFromToken(req.user);
    
    const writeStream = await smbCreateWriteStream(smb, destPath);
    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
      writeStream.end(req.file.buffer);
    });
    
    res.json({ success: true, message: `File "${filename}" berhasil diunggah` });
  } catch (err) {
    console.error('[FILES] Upload error:', err.message);
    res.status(500).json({ error: 'Gagal mengunggah file: ' + err.message });
  }
});

module.exports = router;
