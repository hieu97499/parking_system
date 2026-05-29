import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,
    host: true,   // expose ra LAN để điện thoại truy cập được
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        // Ghi đè Origin để backend CORS luôn thấy localhost khi mobile kết nối qua IP LAN
        headers: { origin: 'http://localhost:5175' },
      },
      '/uploads': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        headers: { origin: 'http://localhost:5175' },
      },
    },
  },
})
