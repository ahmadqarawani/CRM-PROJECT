import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// In dev, Vite proxies /api to Django so the browser sees ONE origin (like nginx in prod):
// session cookie + CSRF work without CORS.
const backend = process.env.BACKEND_URL ?? 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: backend, changeOrigin: false },
      '/admin': { target: backend, changeOrigin: false },
      '/static': { target: backend, changeOrigin: false },
    },
  },
})
