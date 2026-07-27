import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Tidy Nest',
        short_name: 'Tidy Nest',
        description: 'Everything you own, organized in one place',
        start_url: '/',
        display: 'standalone',
        background_color: '#FFF8F3',
        theme_color: '#FFF8F3',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // The app shell works offline; API data always goes to the network
        // (falling back to nothing rather than stale caches).
        navigateFallbackDenylist: [/^\/api\//, /^\/uploads\//],
        runtimeCaching: [
          {
            urlPattern: /^\/api\//,
            handler: 'NetworkOnly',
          },
          {
            // Item photos: immutable random filenames, cache aggressively
            // so cards render offline once a photo has been seen.
            urlPattern: /^\/uploads\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'item-photos',
              expiration: { maxEntries: 500 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      "/api": "http://localhost:8080",
      "/uploads": "http://localhost:8080",
    },
  },
})
