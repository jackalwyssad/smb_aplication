const SftpClient = require('ssh2-sftp-client');

/**
 * Membuat koneksi SFTP baru
 * @param {Object} config - { host, port, username, password }
 * @returns {SftpClient} - instance SFTP yang sudah terhubung
 */
const createSftpConnection = async (config) => {
  const sftp = new SftpClient();
  
  await sftp.connect({
    host: config.host,
    port: config.port || 22,
    username: config.username,
    password: config.password,
    readyTimeout: 10000,
    retries: 1,
    retry_factor: 2,
    retry_minTimeout: 2000,
  });

  return sftp;
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
 * @returns {string} - 'folder' | 'image' | 'video' | 'audio' | 'document' | 'archive' | 'code' | 'file'
 */
const detectFileType = (filename, isDirectory) => {
  if (isDirectory) return 'folder';
  
  const ext = filename.split('.').pop()?.toLowerCase();
  
  const types = {
    image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'ico', 'tiff', 'heic', 'heif', 'raw', 'cr2', 'nef'],
    video: ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v', '3gp', 'ts', 'mpg', 'mpeg'],
    audio: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma', 'opus'],
    document: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'csv', 'rtf', 'odt', 'ods'],
    archive: ['zip', 'rar', 'tar', 'gz', '7z', 'bz2', 'xz', 'tar.gz', 'tar.bz2'],
    code: ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'h', 'php', 'rb', 'go', 'rs', 'swift', 'kt', 'html', 'css', 'json', 'xml', 'yml', 'yaml', 'sh', 'bat'],
    apk: ['apk', 'ipa', 'xapk'],
  };

  for (const [type, exts] of Object.entries(types)) {
    if (exts.includes(ext)) return type;
  }
  
  return 'file';
};

/**
 * Normalize path (pastikan selalu diawali dengan /)
 * @param {string} path
 * @returns {string}
 */
const normalizePath = (path) => {
  if (!path || path === '') return '/';
  return path.startsWith('/') ? path : '/' + path;
};

module.exports = {
  createSftpConnection,
  formatFileSize,
  detectFileType,
  normalizePath,
};
