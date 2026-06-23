const FOLDER_CACHE_PREFIX = 'fb_folder_';

export const folderCache = {
  /**
   * Mengambil cache isi folder berdasarkan path
   */
  get: (path) => {
    try {
      const data = localStorage.getItem(FOLDER_CACHE_PREFIX + path);
      return data ? JSON.parse(data) : null;
    } catch (_) {
      return null;
    }
  },

  /**
   * Menyimpan isi folder ke cache berdasarkan path
   */
  set: (path, files) => {
    try {
      localStorage.setItem(FOLDER_CACHE_PREFIX + path, JSON.stringify(files));
    } catch (_) {}
  },

  /**
   * Bersihkan semua cache folder (misal saat logout)
   */
  clear: () => {
    try {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith(FOLDER_CACHE_PREFIX)) {
          localStorage.removeItem(key);
        }
      }
    } catch (_) {}
  }
};
