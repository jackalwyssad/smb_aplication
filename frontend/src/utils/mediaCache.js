import { filesAPI } from './api';

const CACHE_NAME = 'filebrowser-media-cache';
const THUMB_CACHE_NAME = 'filebrowser-thumb-cache';

/**
 * Membuat cache key unik berdasarkan path, waktu modifikasi, dan ukuran file.
 * Jika file diperbarui di server, cache key akan berubah otomatis sehingga cache ter-refresh.
 */
const getCacheKey = (file) => {
  const mtime = file.modifiedAt || '0';
  const size = file.size || '0';
  return `${window.location.origin}/_local_cache_?path=${encodeURIComponent(file.path)}&mtime=${mtime}&size=${size}`;
};

const getThumbCacheKey = (file) => {
  const mtime = file.modifiedAt || '0';
  const size = file.size || '0';
  return `${window.location.origin}/_thumb_cache_?path=${encodeURIComponent(file.path)}&mtime=${mtime}&size=${size}`;
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
   * Mengambil URL blob lokal dari cache thumbnail untuk file tertentu jika ada
   */
  getThumbnail: async (file) => {
    try {
      const cache = await caches.open(THUMB_CACHE_NAME);
      const key = getThumbCacheKey(file);
      const response = await cache.match(key);
      if (response) {
        const blob = await response.blob();
        return URL.createObjectURL(blob);
      }
    } catch (err) {
      console.warn('[mediaCache] Gagal membaca thumbnail cache:', err.message);
    }
    return null;
  },

  /**
   * Menyimpan JPEG blob thumbnail langsung ke cache
   */
  setThumbnail: async (file, blob) => {
    try {
      const cache = await caches.open(THUMB_CACHE_NAME);
      const key = getThumbCacheKey(file);
      const response = new Response(blob, {
        headers: {
          'Content-Type': 'image/jpeg',
          'Content-Length': blob.size.toString(),
        }
      });
      await cache.put(key, response);
      return true;
    } catch (err) {
      console.warn('[mediaCache] Gagal menulis thumbnail ke cache:', err.message);
    }
    return false;
  },

  /**
   * Mengecek apakah thumbnail sudah ada di cache
   */
  hasThumbnail: async (file) => {
    try {
      const cache = await caches.open(THUMB_CACHE_NAME);
      const key = getThumbCacheKey(file);
      const response = await cache.match(key);
      return !!response;
    } catch (_) {
      return false;
    }
  },

  /**
   * Mem-precache thumbnail untuk file tunggal (gambar atau video frame)
   */
  preCacheFileThumbnail: async (file) => {
    const cached = await mediaCache.hasThumbnail(file);
    if (cached) return;

    if (file.type === 'image') {
      try {
        const url = filesAPI.getThumbnailUrl(file.path);
        const response = await fetch(url);
        if (response.ok) {
          const blob = await response.blob();
          await mediaCache.setThumbnail(file, blob);
        }
      } catch (err) {
        console.warn('Gagal mem-precache thumbnail gambar:', file.name, err);
      }
    } else if (file.type === 'video') {
      const SUPPORTED_VIDEO_EXTENSIONS = ['mp4', 'webm', 'ogg', 'mov'];
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (!SUPPORTED_VIDEO_EXTENSIONS.includes(ext)) return;

      try {
        const url = filesAPI.getStreamUrl(file.path);
        
        const blob = await new Promise((resolve, reject) => {
          const video = document.createElement('video');
          video.src = url;
          video.crossOrigin = 'anonymous';
          video.preload = 'auto';
          video.muted = true;
          video.playsInline = true;
          
          const timeout = setTimeout(() => {
            cleanup();
            reject(new Error('Pre-cache video timeout'));
          }, 15000);

          const cleanup = () => {
            clearTimeout(timeout);
            video.removeEventListener('loadedmetadata', onMetadata);
            video.removeEventListener('seeked', onSeeked);
            video.removeEventListener('error', onError);
            video.src = '';
            video.load();
          };

          const onMetadata = () => {
            video.currentTime = Math.min(1, video.duration / 2 || 1);
          };

          const onSeeked = () => {
            try {
              const canvas = document.createElement('canvas');
              canvas.width = 320;
              canvas.height = 240;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                canvas.toBlob((blob) => {
                  cleanup();
                  if (blob) resolve(blob);
                  else reject(new Error('toBlob null'));
                }, 'image/jpeg', 0.6);
              } else {
                cleanup();
                reject(new Error('ctx null'));
              }
            } catch (e) {
              cleanup();
              reject(e);
            }
          };

          const onError = (e) => {
            cleanup();
            reject(new Error('Video load error'));
          };

          video.addEventListener('loadedmetadata', onMetadata);
          video.addEventListener('seeked', onSeeked);
          video.addEventListener('error', onError);
        });

        await mediaCache.setThumbnail(file, blob);
      } catch (err) {
        console.warn('Gagal mem-precache thumbnail video:', file.name, err.message);
      }
    }
  },

  /**
   * Mem-precache semua media (gambar & video) dalam satu folder secara sekuensial
   */
  preCacheFolder: async (files) => {
    const mediaFiles = files.filter(f => f.type === 'image' || f.type === 'video');
    for (const file of mediaFiles) {
      await mediaCache.preCacheFileThumbnail(file);
    }
  },

  /**
   * Bersihkan semua cache (opsional, jika diperlukan)
   */
  clear: async () => {
    try {
      const res1 = await caches.delete(CACHE_NAME);
      const res2 = await caches.delete(THUMB_CACHE_NAME);
      return res1 || res2;
    } catch (_) {
      return false;
    }
  }
};
