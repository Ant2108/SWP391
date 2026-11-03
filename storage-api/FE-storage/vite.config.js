import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Backend Spring Boot chạy ở :8080, các controller đều map dưới /api/..., nên proxy giữ nguyên path.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_BACKEND_URL || 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
