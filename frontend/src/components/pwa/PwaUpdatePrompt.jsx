import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * PWA lifecycle UI (progressive enhancement — never a hard dependency).
 *
 * - "New version available" prompt: effectively dormant now. The service worker registers
 *   with registerType:'autoUpdate' (see vite.config.js), so a new build activates on its
 *   own and `needRefresh` does not fire — candidates can never be left running a stale
 *   bundle because they missed a banner, which previously cost real interviews their
 *   session recording. The branch is kept because it costs nothing and still renders if a
 *   waiting worker is ever reported.
 * - "Ready to work offline" is shown once, briefly, as a passive confirmation.
 *
 * If service workers are unsupported or registration fails, none of these callbacks fire and
 * the app simply runs as a normal web app — exactly the graceful-degradation requirement.
 */
export default function PwaUpdatePrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      // Non-fatal: log and let the app keep working as a plain web app.
      console.warn('[pwa] Service worker registration failed:', error);
    },
  });

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  if (!offlineReady && !needRefresh) return null;

  return (
    <div className="fixed bottom-4 inset-x-4 z-[9999] flex justify-center pointer-events-none">
      <div className="pointer-events-auto w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur shadow-xl px-4 py-3 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          {needRefresh ? (
            <>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                A new version is available
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Refresh to get the latest updates.
              </p>
            </>
          ) : (
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              App ready to work offline.
            </p>
          )}
        </div>

        {needRefresh && (
          <button
            onClick={() => updateServiceWorker(true)}
            className="shrink-0 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-2 transition-colors"
          >
            Refresh
          </button>
        )}
        <button
          onClick={close}
          className="shrink-0 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 text-xs font-medium px-2 py-2 transition-colors"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
