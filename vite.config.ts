import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 1600 },
  server: { port: 5173, strictPort: false },
  preview: { port: 4173 },
})
