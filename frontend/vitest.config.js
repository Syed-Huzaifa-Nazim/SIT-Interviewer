import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Deliberately SEPARATE from vite.config.js so the production build config is untouched.
// vite.config.js carries the PWA/service-worker setup, which has no place in a jsdom test
// run — keeping the two apart means a test-only change can never affect a deploy.
//
// The '@' alias is the one thing that MUST be mirrored from vite.config.js: module
// resolution has to agree between the build and the tests, or components import fine in
// production and fail to resolve under vitest (or vice versa).
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // vite-plugin-pwa is not loaded here (see above), so its virtual module has nothing
      // to resolve against and any test mounting the real App fails at import analysis —
      // before vi.mock could ever apply. The stub keeps the PWA prompt inert.
      'virtual:pwa-register/react': fileURLToPath(new URL('./src/test/pwa-register-stub.js', import.meta.url)),
    },
  },
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.test.{js,jsx}'],
    css: false,
  },
})
