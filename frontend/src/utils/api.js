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

  // Upload file sebagai raw binary stream via XHR (tidak via axios)
  // XHR memberikan progress upload yang akurat dan menghindari timeout proxy
  upload: (path, file, onProgress) => {
    return new Promise((resolve, reject) => {
      const token = sessionStorage.getItem('fb_token');
      const encodedPath = encodeURIComponent(path);
      const encodedFilename = encodeURIComponent(file.name);
      const url = `${BASE_URL}/files/upload-stream?path=${encodedPath}&token=${token}`;

      const xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);
      xhr.setRequestHeader('X-Filename', encodedFilename);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress({ loaded: e.loaded, total: e.total });
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch (_) {
            resolve({ success: true });
          }
        } else {
          let errorMsg = 'Upload gagal';
          try {
            const parsed = JSON.parse(xhr.responseText);
            errorMsg = parsed.error || errorMsg;
          } catch (_) {}
          reject(new Error(errorMsg));
        }
      });

      xhr.addEventListener('error', () => reject(new Error('Koneksi gagal saat upload')));
      xhr.addEventListener('abort', () => reject(new Error('Upload dibatalkan')));

      xhr.send(file); // Kirim file langsung sebagai body (raw binary)
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
