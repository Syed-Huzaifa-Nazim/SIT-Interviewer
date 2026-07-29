import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Deliberately SEPARATE from vite.config.js so the production build config is untouched.
// vite.config.js carries the PWA/service-worker setup, which has no place in a jsdom test
// run — keeping the two apart means a test-only change can never affect a deploy.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.test.{js,jsx}'],
    css: false,
  },
})
