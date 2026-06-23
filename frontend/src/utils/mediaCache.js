import { filesAPI } from './api';

const DB_NAME = 'FileBrowserCacheDB';
const DB_VERSION = 1;
const STORE_MEDIA = 'media';
const STORE_THUMBS = 'thumbnails';

let dbInstance = null;

const getDB = () => {
  if (dbInstance) return Promise.resolve(dbInstance);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_MEDIA)) {
        db.createObjectStore(STORE_MEDIA);
      }
      if (!db.objectStoreNames.contains(STORE_THUMBS)) {
        db.createObjectStore(STORE_THUMBS);
      }
    };
    request.onsuccess = (e) => {
      dbInstance = e.target.result;
      resolve(dbInstance);
    };
    request.onerror = (e) => {
      reject(new Error('Gagal membuka IndexedDB: ' + e.target.error?.message));
    };
  });
};

const dbGet = async (storeName, key) => {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn(`[mediaCache] dbGet failed for ${storeName}/${key}:`, err.message);
    return null;
  }
};

const dbSet = async (storeName, key, value) => {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(value, key);
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn(`[mediaCache] dbSet failed for ${storeName}/${key}:`, err.message);
    return false;
  }
};

const dbHas = async (storeName, key) => {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.count(key);
      request.onsuccess = () => resolve(request.result > 0);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn(`[mediaCache] dbHas failed for ${storeName}/${key}:`, err.message);
    return false;
  }
};

const dbClear = async () => {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_MEDIA, STORE_THUMBS], 'readwrite');
      const mediaStore = transaction.objectStore(STORE_MEDIA);
      const thumbsStore = transaction.objectStore(STORE_THUMBS);
      mediaStore.clear();
      thumbsStore.clear();
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (err) {
    console.warn('[mediaCache] dbClear failed:', err.message);
    return false;
  }
};

/**
 * Membuat cache key unik berdasarkan path, waktu modifikasi, dan ukuran file.
 */
const getCacheKey = (file) => {
  const mtime = file.modifiedAt || '0';
  const size = file.size || '0';
  return `${file.path}|${mtime}|${size}`;
};

export const mediaCache = {
  get: async (file) => {
    const key = getCacheKey(file);
    const blob = await dbGet(STORE_MEDIA, key);
    if (blob instanceof Blob) {
      return URL.createObjectURL(blob);
    }
    return null;
  },

  set: async (file, authenticatedUrl) => {
    try {
      const response = await fetch(authenticatedUrl);
      if (response.ok) {
        const blob = await response.blob();
        return await mediaCache.setBlob(file, blob);
      }
    } catch (err) {
      console.warn('[mediaCache] Gagal fetch dan tulis ke cache:', err.message);
    }
    return false;
  },

  setBlob: async (file, blob) => {
    const key = getCacheKey(file);
    return await dbSet(STORE_MEDIA, key, blob);
  },

  has: async (file) => {
    const key = getCacheKey(file);
    return await dbHas(STORE_MEDIA, key);
  },

  getThumbnail: async (file) => {
    const key = getCacheKey(file);
    const data = await dbGet(STORE_THUMBS, key);
    if (data) {
      if (data.failed) {
        return 'FAILED';
      }
      if (data.blob instanceof Blob) {
        return URL.createObjectURL(data.blob);
      }
    }
    return null;
  },

  setThumbnail: async (file, blob) => {
    const key = getCacheKey(file);
    return await dbSet(STORE_THUMBS, key, { blob, failed: false });
  },

  setFailedThumbnail: async (file) => {
    const key = getCacheKey(file);
    return await dbSet(STORE_THUMBS, key, { failed: true });
  },

  hasThumbnail: async (file) => {
    const key = getCacheKey(file);
    return await dbHas(STORE_THUMBS, key);
  },

  preCacheFileThumbnail: async (file) => {
    const cached = await mediaCache.hasThumbnail(file);
    if (cached) return;

    if (file.type === 'image' || file.type === 'video') {
      try {
        const url = filesAPI.getThumbnailUrl(file.path);
        const response = await fetch(url);
        if (response.ok) {
          const blob = await response.blob();
          await mediaCache.setThumbnail(file, blob);
        } else {
          await mediaCache.setFailedThumbnail(file);
        }
      } catch (err) {
        console.warn('Gagal mem-precache thumbnail:', file.name, err.message);
        await mediaCache.setFailedThumbnail(file);
      }
    }
  },

  preCacheFolder: async (files) => {
    const mediaFiles = files.filter(f => f.type === 'image' || f.type === 'video');
    for (const file of mediaFiles) {
      await mediaCache.preCacheFileThumbnail(file);
    }
  },

  clear: async () => {
    return await dbClear();
  }
};
