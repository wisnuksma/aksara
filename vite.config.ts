import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// base './' supaya hasil build bisa dipasang di GitHub Pages (subfolder repo).
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1500 },
  preview: { port: 4173, strictPort: true },
  plugins: [
    react(),
    VitePWA({
      // Versi baru tidak langsung memuat ulang; pengguna diberi tombol "Muat ulang".
      registerType: 'prompt',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        id: 'aksara',
        name: 'Aksara',
        short_name: 'Aksara',
        description: 'Tulis naskah dan bangun dunia ceritamu, di satu meja.',
        lang: 'id',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#1B1E2B',
        theme_color: '#1B1E2B',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Semua file aplikasi disimpan supaya bisa dibuka tanpa internet.
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
})
