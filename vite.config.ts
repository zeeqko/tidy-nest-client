import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  worker: {
    // src/lib/backgroundRemoval.worker.ts dynamically imports
    // @imgly/background-removal from inside the worker, so the bundled
    // worker chunk needs to be an ES module (Vite's default 'iife' worker
    // format can't contain a top-level dynamic import the way this needs).
    format: 'es',
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: true,
        type: 'module',
      },
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
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/pwa-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // @imgly/background-removal (dynamically imported only when a photo
        // is attached, see src/lib/backgroundRemoval.ts) pulls in
        // onnxruntime-web, whose WASM binary and JS runtime chunks land in
        // dist/assets as ort*.js / ort*.wasm. The .wasm isn't matched by
        // globPatterns above, but the .js glue/runtime chunks are — exclude
        // them explicitly so the service worker never eagerly precaches the
        // ONNX runtime for visitors who never add a photo. The actual model
        // weights are fetched from imgly's CDN at inference time and were
        // never part of this build's output to begin with.
        globIgnores: ['**/ort*.js', '**/ort*.wasm'],
        // The app shell works offline; API data always goes to the network
        // (falling back to nothing rather than stale caches).
        navigateFallbackDenylist: [/^\/api\//, /^\/uploads\//],
        // Workbox matches urlPattern regexes against the full href, so these
        // rules test the pathname of same-origin requests instead.
        runtimeCaching: [
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly',
          },
          {
            // Item photos: the backend streams these out of R2, and the random
            // filenames are immutable, so cache them aggressively — cards then
            // render offline, and repeat views skip the round trip to the bucket.
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/uploads/'),
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
