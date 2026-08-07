/**
 * Stand-in for `virtual:pwa-register/react`, which only exists while vite-plugin-pwa is
 * running. vitest.config.js aliases the virtual id here so any test that mounts the real
 * App can get past PwaUpdatePrompt's import — a `vi.mock` cannot, because the failure
 * happens in Vite's import analysis before module mocking applies.
 */
export function useRegisterSW() {
  return {
    needRefresh: [false, () => {}],
    offlineReady: [false, () => {}],
    updateServiceWorker: () => {},
  };
}
