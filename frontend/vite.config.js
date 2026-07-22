import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // We drive updates ourselves (prompt-to-refresh) instead of silently swapping the
      // app out from under a user who might be mid-interview. See PwaUpdatePrompt.jsx.
      registerType: 'prompt',
      // Precache the app shell + brand assets so the installed app opens instantly and the
      // UI shell is available offline. These change only on deploy.
      includeAssets: [
        'favicon.svg',
        'apple-touch-icon.png',
        'logo.jpg',
      ],
      manifest: {
        name: 'Interviewer.AI — AI Mock Interview Platform',
        short_name: 'Interviewer.AI',
        description:
          'AI-powered mock and proctored interview platform for technical and behavioral assessments.',
        // White to match the app's light theme, the existing <meta theme-color>, and the
        // launch splash — so the installed status bar blends seamlessly with white content.
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'pwa-maskable-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the built shell (JS/CSS/HTML/icons/fonts).
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,jpeg,ico,woff,woff2}'],
        // SPA fallback: client-side routes resolve to the precached index.html...
        navigateFallback: 'index.html',
        // ...but NEVER let navigation fallback swallow API calls or real asset files.
        navigateFallbackDenylist: [/^\/api\//, /\/[^/?]+\.[^/]+$/],
        // Allow the larger precache entries (the 512px icon, vendor chunks).
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // A new SW takes control as soon as the user accepts the refresh prompt.
        clientsClaim: true,
        skipWaiting: false,
        runtimeCaching: [
          {
            // RELIABILITY HARD RULE: every backend call is network-only. Auth, live
            // interview state, transcript, proctoring snapshots, admin actions and uploads
            // must always hit the server fresh — never a cached/stale response, and never a
            // cross-user leak on a shared device. Matches same- or cross-origin '/api/'.
            urlPattern: ({ url }) => url.pathname.includes('/api/'),
            handler: 'NetworkOnly',
            method: 'GET',
          },
          {
            // Google Fonts stylesheet — refresh in the background, serve fast meanwhile.
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' },
          },
          {
            // Google Fonts files — immutable, cache long.
            urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // NOTE: cross-origin CDN ML models (MediaPipe / TensorFlow.js) are deliberately
          // NOT listed here. With no matching runtimeCaching rule the service worker does
          // not intercept them at all — they load straight from the network, so proctoring
          // can never be broken by a stale/partial cached model.
        ],
      },
      // Leave the dev server completely untouched — the SW is only active in production
      // builds (and `vite preview`), so `npm run dev` behaves exactly as before.
      devOptions: {
        enabled: false,
      },
    }),
  ],
})
