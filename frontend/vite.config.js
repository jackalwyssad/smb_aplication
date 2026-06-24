import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true, // Agar bisa diakses dari HP di jaringan yang sama
    proxy: {
      // Rute upload-stream: tidak buffer, timeout panjang
      '/api/files/upload-stream': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
        proxyTimeout: 0,       // Tanpa batas waktu proxy
        timeout: 0,            // Tanpa batas waktu koneksi
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            // Forward X-Filename header agar tidak terstrip
            proxyReq.setHeader('connection', 'keep-alive');
          });
        },
      },
      // Rute lainnya
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1600,
  }
})
