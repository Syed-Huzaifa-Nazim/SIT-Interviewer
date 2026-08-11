import { useEffect, useState } from 'react';
import { onSlowRequestChange } from '../../services/api';

/**
 * Surfaces an unusually slow in-flight request so a long wait doesn't look
 * indistinguishable from the app being broken. api.js flags anything still pending
 * past its threshold; this renders that as a plain, reassuring banner.
 *
 * The wording deliberately no longer mentions the server "waking up". That text was
 * written for Render's free tier, which really did spin the backend down; on Railway
 * it never sleeps, so the old copy told candidates the server was asleep whenever a
 * request was merely slow — alarming and, more to the point, untrue. The banner now
 * says only what is actually known: the request is still running.
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
          Still working — this is taking longer than usual. Please don't close this tab.
        </p>
      </div>
    </div>
  );
}
