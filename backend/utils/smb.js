const SMB2 = require('@marsaud/smb2');

// Cache untuk menyimpan instance client SMB2 agar koneksi TCP dan Session tidak selalu dibuat ulang
const clientCache = new Map();

/**
 * Membuat koneksi SMB2 ke Windows File Sharing (atau mengambil dari cache jika ada)
 * @param {Object} config - { host, share, username, password, domain }
 * @returns {SMB2} - instance SMB2 yang siap digunakan
 */
const createSmbClient = (config) => {
  const key = `${config.host}|${config.share}|${config.username}|${config.password}|${config.domain || 'WORKGROUP'}`;
  
  if (clientCache.has(key)) {
    const cached = clientCache.get(key);
    cached.lastAccess = Date.now();
    return cached.client;
  }

  const client = new SMB2({
    share: `\\\\${config.host}\\${config.share}`,
    domain: config.domain || 'WORKGROUP',
    username: config.username,
    password: config.password,
    autoCloseTimeout: 30000, // Auto close setelah 30 detik tidak aktif (menjaga koneksi tetap hangat)
  });

  clientCache.set(key, {
    client,
    lastAccess: Date.now()
  });

  // Bersihkan cache yang sudah tidak aktif (idle lebih dari 2 menit) secara periodik
  if (clientCache.size > 20) {
    const now = Date.now();
    for (const [k, v] of clientCache.entries()) {
      if (now - v.lastAccess > 120000) {
        clientCache.delete(k);
      }
    }
  }

  return client;
};

/**
 * Test koneksi SMB2 dengan mencoba membaca root directory
 * CATATAN: Tidak panggil client.close() manual — biarkan autoCloseTimeout
 * @param {Object} config - { host, share, username, password, domain }
 */
const testSmbConnection = (config) => {
  return new Promise((resolve, reject) => {
    let client;
    try {
      client = createSmbClient(config);
    } catch (err) {
      return reject(err);
    }

    // Handle error event dari library (prevent unhandled crash)
    // @marsaud/smb2 tidak support .on(), gunakan try/catch saja

    client.readdir('', (err, files) => {
      if (err) {
        reject(err);
      } else {
        resolve(files || []);
      }
      // JANGAN panggil client.close() di sini — ada bug di library
      // autoCloseTimeout akan bersihkan otomatis
    });
  });
};

/**
 * Baca isi direktori via SMB2
 * @param {SMB2} client
 * @param {string} path - path relatif di dalam share
 * @returns {Promise<Array>}
 */
const smbReaddir = (client, path) => {
  return new Promise((resolve, reject) => {
    client.readdir(path, (err, files) => {
      if (err) reject(err);
      else resolve(files || []);
    });
  });
};

/**
 * Ambil info stat file/folder via SMB2
 * @param {SMB2} client
 * @param {string} path
 * @returns {Promise<Object>}
 */
const smbStat = (client, path) => {
  return new Promise((resolve, reject) => {
    client.stat(path, (err, stat) => {
      if (err) reject(err);
      else resolve(stat);
    });
  });
};

/**
 * Buat read stream dari SMB2
 * @param {SMB2} client
 * @param {string} path
 * @param {Object|null} options - { start, end } untuk range, atau null untuk full file
 * @returns {Promise<ReadableStream>}
 */
const smbCreateReadStream = (client, path, options = null) => {
  return new Promise((resolve, reject) => {
    const callback = (err, stream) => {
      if (err) reject(err);
      else resolve(stream);
    };
    // Hanya pass options jika ada start/end (range request)
    // Kalau options kosong/null, panggil dengan 2 argumen saja
    if (options && (options.start !== undefined || options.end !== undefined)) {
      client.createReadStream(path, options, callback);
    } else {
      client.createReadStream(path, callback);
    }
  });
};

/**
 * Buat folder baru via SMB2
 * @param {SMB2} client
 * @param {string} path
 * @returns {Promise<void>}
 */
const smbMkdir = (client, path) => {
  return new Promise((resolve, reject) => {
    client.mkdir(path, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
};

/**
 * Hapus file via SMB2
 * @param {SMB2} client
 * @param {string} path
 * @returns {Promise<void>}
 */
const smbUnlink = (client, path) => {
  return new Promise((resolve, reject) => {
    client.unlink(path, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
};

/**
 * Hapus folder via SMB2
 * @param {SMB2} client
 * @param {string} path
 * @returns {Promise<void>}
 */
const smbRmdir = (client, path) => {
  return new Promise((resolve, reject) => {
    client.rmdir(path, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
};

/**
 * Rename/pindahkan file/folder via SMB2
 * @param {SMB2} client
 * @param {string} oldPath
 * @param {string} newPath
 * @returns {Promise<void>}
 */
const smbRename = (client, oldPath, newPath) => {
  return new Promise((resolve, reject) => {
    client.rename(oldPath, newPath, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
};

/**
 * Buat write stream ke SMB2 (untuk upload file)
 * @param {SMB2} client
 * @param {string} path
 * @returns {Promise<WritableStream>}
 */
const smbCreateWriteStream = (client, path) => {
  return new Promise((resolve, reject) => {
    client.createWriteStream(path, (err, stream) => {
      if (err) reject(err);
      else resolve(stream);
    });
  });
};

/**
 * Format ukuran file ke string yang mudah dibaca
 * @param {number} bytes
 * @returns {string}
 */
const formatFileSize = (bytes) => {
  if (bytes === null || bytes === undefined || bytes < 0) return '';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0);
  return `${size} ${units[i]}`;
};

/**
 * Deteksi tipe file berdasarkan ekstensi
 * @param {string} filename
 * @param {boolean} isDirectory
 * @returns {string}
 */
const detectFileType = (filename, isDirectory) => {
  if (isDirectory) return 'folder';

  const ext = filename.split('.').pop()?.toLowerCase();

  const types = {
    image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'ico', 'tiff', 'heic', 'heif'],
    video: ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v', '3gp', 'ts', 'mpg', 'mpeg'],
    audio: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma', 'opus'],
    document: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'csv', 'rtf', 'odt', 'ods'],
    archive: ['zip', 'rar', 'tar', 'gz', '7z', 'bz2', 'xz'],
    code: ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'h', 'php', 'rb', 'go', 'rs', 'html', 'css', 'json', 'xml', 'yml', 'yaml', 'sh', 'bat'],
    apk: ['apk', 'ipa', 'xapk'],
  };

  for (const [type, exts] of Object.entries(types)) {
    if (exts.includes(ext)) return type;
  }

  return 'file';
};

/**
 * Normalize path SMB — hapus leading/trailing backslash, ganti / dengan \
 * Root = string kosong ''
 * @param {string} path
 * @returns {string}
 */
const normalizeSmbPath = (path) => {
  if (!path || path === '/' || path === '\\') return '';
  return path.replace(/\//g, '\\').replace(/^\\+|\\+$/g, '');
};

module.exports = {
  createSmbClient,
  testSmbConnection,
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
};
