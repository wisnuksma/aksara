import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' supaya hasil build bisa dipasang di GitHub Pages (subfolder repo).
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1500 },
  plugins: [react()],
})
