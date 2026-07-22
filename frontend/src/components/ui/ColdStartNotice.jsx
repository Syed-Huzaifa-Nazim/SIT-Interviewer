import { useEffect, useState } from 'react';
import { onSlowRequestChange } from '../../services/api';

/**
 * Free-tier hosting (Render et al.) spins the backend down after idling and takes
 * 30-50s to wake back up on the next request. Without this, that delay looks
 * indistinguishable from the app being broken. api.js flags any request still
 * pending past a few seconds as a likely cold start; this just surfaces that as a
 * plain, reassuring banner instead of silence.
 */
export default function ColdStartNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => onSlowRequestChange(setVisible), []);

  if (!visible) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-[9999] flex justify-center pointer-events-none px-4 pt-3">
      <div className="pointer-events-auto flex items-center gap-2.5 rounded-full border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/90 backdrop-blur px-4 py-2 shadow-lg">
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
        </span>
        <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
          Waking up the server — this can take up to a minute on the first request.
        </p>
      </div>
    </div>
  );
}
