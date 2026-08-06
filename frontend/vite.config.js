import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  // '@' -> /src. Purely additive: nothing imported '@/...' before this, so no existing
  // import path changes meaning. The admin design-system components under
  // src/components/shadcn/ are written against this alias (it is the convention every
  // shadcn snippet assumes), which keeps pasted-in components working unmodified.
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Pin the admin-only design system into one predictably-named chunk.
        //
        // Left to the bundler's own splitting, the shared Radix/motion code landed in a
        // chunk named after whichever module happened to pull it in first ('misc-*.js',
        // ~212KB). That name does not match the 'Admin*' precache exclusion below, so the
        // service worker handed every candidate the entire admin UI up front — quietly
        // undoing the code-splitting. Naming it here makes the exclusion reliable instead
        // of dependent on a bundler heuristic.
        //
        // recharts is deliberately NOT included: the candidate's own report page renders
        // charts, so it belongs in the precached app shell.
        manualChunks(id) {
          if (
            id.includes('/components/shadcn/') ||
            id.includes('@radix-ui') ||
            id.includes('/node_modules/motion') ||
            id.includes('/node_modules/framer-motion')
          ) {
            return 'admin-ui';
          }
          return undefined;
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      // Candidates must always run the current build. This was 'prompt' so an update never
      // swapped the app mid-interview, but that meant a returning candidate kept serving the
      // OLD cached bundle until they happened to accept a refresh banner — a normal reload,
      // even a hard one, does not bypass an active service worker. That silently cost real
      // interviews their session recording after the recording fix had already shipped: the
      // code was live on the server and the browser was still running the broken version.
      // A stale build on a one-shot proctored interview is far worse than a reload prompt,
      // and the worker still only activates on a page load (never mid-session), so the
      // original mid-interview concern does not apply in practice.
      registerType: 'autoUpdate',
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
        // ...except admin-only code. The spreadsheet parser is ~930KB and only needed when
        // an admin uploads an .xlsx in the Bulk Email Module; the Admin* chunks are the
        // code-split Admin Portal (Radix, motion and the chart layer live in AdminLayout).
        // A candidate never renders any of it, and precaching would hand them the whole
        // download up front anyway — which is exactly what code-splitting them was for.
        // All of it still loads on demand over the network when an admin opens the portal.
        globIgnores: ['**/exceljs*.js', '**/Admin*.js', '**/admin-ui*.js'],
        // SPA fallback: client-side routes resolve to the precached index.html...
        navigateFallback: 'index.html',
        // ...but NEVER let navigation fallback swallow API calls or real asset files.
        navigateFallbackDenylist: [/^\/api\//, /\/[^/?]+\.[^/]+$/],
        // Allow the larger precache entries (the 512px icon, vendor chunks).
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // Both are required for registerType:'autoUpdate' to actually deliver a new build.
        // skipWaiting was false, which parks a freshly-installed worker in "waiting" until
        // every tab of the app is closed — so a candidate who kept the tab open would keep
        // running the old bundle no matter how many times they reloaded. clientsClaim then
        // lets the activated worker take over existing pages immediately instead of only
        // controlling the next navigation.
        clientsClaim: true,
        skipWaiting: true,
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
