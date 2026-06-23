const CACHE_NAME = 'filebrowser-media-cache';

/**
 * Membuat cache key unik berdasarkan path, waktu modifikasi, dan ukuran file.
 * Jika file diperbarui di server, cache key akan berubah otomatis sehingga cache ter-refresh.
 */
const getCacheKey = (file) => {
  const mtime = file.modifiedAt || '0';
  const size = file.size || '0';
  return `${window.location.origin}/_local_cache_?path=${encodeURIComponent(file.path)}&mtime=${mtime}&size=${size}`;
};

export const mediaCache = {
  /**
   * Mengambil URL blob lokal dari cache untuk file tertentu jika ada
   */
  get: async (file) => {
    try {
      const cache = await caches.open(CACHE_NAME);
      const key = getCacheKey(file);
      const response = await cache.match(key);
      if (response) {
        const blob = await response.blob();
        return URL.createObjectURL(blob);
      }
    } catch (err) {
      console.warn('[mediaCache] Gagal membaca cache:', err.message);
    }
    return null;
  },

  set: async (file, authenticatedUrl) => {
    try {
      const cache = await caches.open(CACHE_NAME);
      const key = getCacheKey(file);
      
      // Lakukan fetch untuk mendapatkan file lengkap
      const response = await fetch(authenticatedUrl);
      if (response.ok) {
        await cache.put(key, response);
        return true;
      }
    } catch (err) {
      console.warn('[mediaCache] Gagal menulis ke cache:', err.message);
    }
    return false;
  },

  /**
   * Menyimpan objek Blob langsung ke cache
   */
  setBlob: async (file, blob) => {
    try {
      const cache = await caches.open(CACHE_NAME);
      const key = getCacheKey(file);
      const response = new Response(blob, {
        headers: {
          'Content-Type': blob.type || 'video/mp4',
          'Content-Length': blob.size.toString(),
        }
      });
      await cache.put(key, response);
      return true;
    } catch (err) {
      console.warn('[mediaCache] Gagal menulis blob ke cache:', err.message);
    }
    return false;
  },

  /**
   * Mengecek apakah file sudah ada di cache
   */
  has: async (file) => {
    try {
      const cache = await caches.open(CACHE_NAME);
      const key = getCacheKey(file);
      const response = await cache.match(key);
      return !!response;
    } catch (_) {
      return false;
    }
  },

  /**
   * Bersihkan semua cache (opsional, jika diperlukan)
   */
  clear: async () => {
    try {
      return await caches.delete(CACHE_NAME);
    } catch (_) {
      return false;
    }
  }
};
