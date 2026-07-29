import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// Unmount between tests so one test's DOM can never leak into the next.
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

// jsdom implements neither of these, and several components call them on mount.
window.matchMedia =
  window.matchMedia ||
  ((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }))

window.scrollTo = window.scrollTo || (() => {})

globalThis.ResizeObserver =
  globalThis.ResizeObserver ||
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

globalThis.IntersectionObserver =
  globalThis.IntersectionObserver ||
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
