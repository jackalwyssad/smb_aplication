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

  upload: (path, file, onUploadProgress) => {
    const formData = new FormData();
    formData.append('path', path);
    formData.append('file', file);
    return api.post('/files/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress,
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
};

export default api;
