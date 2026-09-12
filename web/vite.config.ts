import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Same-origin dev proxy — the API has no CORS setup, so /auth, /categories,
// /documents, /reviews and /versions forward to the Express server on :3000 in dev too.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/auth': 'http://localhost:3000',
      '/categories': 'http://localhost:3000',
      '/documents': 'http://localhost:3000',
      '/reviews': 'http://localhost:3000',
      '/versions': 'http://localhost:3000',
    },
  },
})
