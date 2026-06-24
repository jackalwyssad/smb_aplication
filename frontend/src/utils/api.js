import axios from 'axios';

// Base URL - menggunakan Vite proxy di dev, atau env variable di production
const BASE_URL = import.meta.env.VITE_API_URL || '/api';

// Axios instance
const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Axios instance khusus untuk upload (tanpa timeout)
const uploadApi = axios.create({
  baseURL: BASE_URL,
  timeout: 0, // Tanpa batas waktu untuk file besar
  headers: {
    'Content-Type': 'application/json',
  },
});

// Tambah token ke upload requests juga
uploadApi.interceptors.request.use(
  (config) => {
    const token = sessionStorage.getItem('fb_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);
uploadApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 || error.response?.status === 403) {
      sessionStorage.removeItem('fb_token');
      sessionStorage.removeItem('fb_user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// Request interceptor - tambah token ke setiap request
api.interceptors.request.use(
  (config) => {
    const token = sessionStorage.getItem('fb_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle 401 errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 || error.response?.status === 403) {
      // Token expired atau invalid - hapus session
      sessionStorage.removeItem('fb_token');
      sessionStorage.removeItem('fb_user');
      // Redirect ke login
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// ==================
// AUTH API
// ==================
export const authAPI = {
  login: (credentials) => api.post('/auth/login', credentials),
  logout: (token) => api.post('/auth/logout', {}, {
    headers: { Authorization: `Bearer ${token}` }
  }),
  verify: (token) => api.post('/auth/verify', {}, {
    headers: { Authorization: `Bearer ${token}` }
  }),
};

// ==================
// FILES API
// ==================
export const filesAPI = {
  list: (path = '/') => api.get('/files/list', { params: { path } }),

  mkdir: (path, name) => api.post('/files/mkdir', { path, name }),

  delete: (path) => api.post('/files/delete', { path }),

  rename: (path, newName) => api.post('/files/rename', { path, newName }),

  // Upload file sebagai chunked upload via XHR
  // Mengirim file dalam potongan 5MB untuk mencegah timeout dan mendukung batal (cancel)
  upload: (path, file, onProgress, cancelRef) => {
    return new Promise((resolve, reject) => {
      const token = sessionStorage.getItem('fb_token');
      const encodedPath = encodeURIComponent(path);
      const encodedFilename = encodeURIComponent(file.name);
      
      const chunkSize = 5 * 1024 * 1024; // 5MB chunks
      const totalChunks = Math.ceil(file.size / chunkSize);
      const uploadId = `upload_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      
      let currentChunkIndex = 0;
      let currentXhr = null;
      let isCancelled = false;

      const uploadNextChunk = () => {
        if (isCancelled) return;

        if (currentChunkIndex >= totalChunks) {
          resolve({ success: true });
          return;
        }

        const start = currentChunkIndex * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        const chunk = file.slice(start, end);
        const isLast = (currentChunkIndex === totalChunks - 1).toString();

        const url = `${BASE_URL}/files/upload-chunk?uploadId=${uploadId}&index=${currentChunkIndex}&total=${totalChunks}&filename=${encodedFilename}&path=${encodedPath}&isLast=${isLast}&token=${token}`;

        const xhr = new XMLHttpRequest();
        currentXhr = xhr;
        xhr.open('POST', url, true);
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.setRequestHeader('Content-Type', 'application/octet-stream');

        xhr.upload.addEventListener('progress', (e) => {
          if (isCancelled) return;
          if (e.lengthComputable && onProgress) {
            const loadedBytes = start + e.loaded;
            onProgress({ loaded: loadedBytes, total: file.size });
          }
        });

        xhr.addEventListener('load', () => {
          if (isCancelled) return;
          if (xhr.status >= 200 && xhr.status < 300) {
            currentChunkIndex++;
            uploadNextChunk();
          } else {
            let errorMsg = 'Upload gagal';
            try {
              const parsed = JSON.parse(xhr.responseText);
              errorMsg = parsed.error || errorMsg;
            } catch (_) {}
            reject(new Error(errorMsg));
          }
        });

        xhr.addEventListener('error', () => {
          if (isCancelled) return;
          reject(new Error('Koneksi gagal saat upload'));
        });

        xhr.addEventListener('abort', () => {
          reject(new Error('Upload dibatalkan'));
        });

        xhr.send(chunk);
      };

      if (cancelRef) {
        cancelRef.cancel = () => {
          isCancelled = true;
          if (currentXhr) {
            currentXhr.abort();
          }
          // Panggil API cancel ke backend untuk membersihkan chunk temp
          const cancelUrl = `${BASE_URL}/files/upload-cancel?uploadId=${uploadId}&total=${totalChunks}&token=${token}`;
          axios.delete(cancelUrl).catch(err => {
            console.error('[UPLOAD] Gagal membatalkan upload di backend:', err.message);
          });
          reject(new Error('Upload dibatalkan oleh pengguna'));
        };
      }

      uploadNextChunk();
    });
  },
  // URL untuk streaming langsung (digunakan sebagai src di img/video)
  getStreamUrl: (path) => {
    const token = sessionStorage.getItem('fb_token');
    return `${BASE_URL}/files/stream?path=${encodeURIComponent(path)}&token=${token}`;
  },

  getThumbnailUrl: (path) => {
    const token = sessionStorage.getItem('fb_token');
    return `${BASE_URL}/files/thumbnail?path=${encodeURIComponent(path)}&token=${token}`;
  },

  getDownloadUrl: (path) => {
    const token = sessionStorage.getItem('fb_token');
    return `${BASE_URL}/files/download?path=${encodeURIComponent(path)}&token=${token}`;
  },

  getTranscodeStatus: (path, start = false) => api.get('/files/transcode-status', { params: { path, start } }),

  getTranscodedStreamUrl: (path) => {
    const token = sessionStorage.getItem('fb_token');
    return `${BASE_URL}/files/stream-transcoded?path=${encodeURIComponent(path)}&token=${token}`;
  },
};

export default api;
