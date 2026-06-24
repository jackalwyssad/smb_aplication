import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      // Upload chunks: tanpa timeout, tidak di-buffer
      '/api/files/upload-chunk': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
        proxyTimeout: 0,
        timeout: 0,
      },
      '/api/files/upload-cancel': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      // Semua route API lainnya
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

