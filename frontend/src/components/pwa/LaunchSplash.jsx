import { useEffect, useState } from 'react';

/**
 * Branded launch splash — shown ONLY when the app is opened as an installed PWA
 * (standalone display mode), never in a normal browser tab, so frequent web visitors are
 * not made to sit through it. It continues the OS's static splash (same white background)
 * with a brief, deliberate logo reveal, then fades into the real app.
 *
 * Kept intentionally lightweight (CSS/SVG only, no WebGL, no dependency) because this paints
 * at the very first moment of launch, before the rest of the app framework is warm.
 */
function isStandalone() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: fullscreen)').matches ||
    // iOS Safari's non-standard flag for home-screen web apps.
    window.navigator?.standalone === true
  );
}

export default function LaunchSplash() {
  // Decide once, synchronously, so a browser-tab visit never even mounts the overlay.
  const [visible, setVisible] = useState(() => isStandalone());
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    // Hold briefly so the reveal reads as intentional, then fade out. ~1.1s on-screen,
    // ~0.45s fade — long enough to feel premium, short enough not to annoy.
    const hold = setTimeout(() => setLeaving(true), 1100);
    const done = setTimeout(() => setVisible(false), 1550);
    return () => {
      clearTimeout(hold);
      clearTimeout(done);
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2147483647,
        background: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: leaving ? 0 : 1,
        transition: 'opacity 0.45s ease',
        pointerEvents: leaving ? 'none' : 'auto',
      }}
    >
      <style>{`
        @keyframes lsplash-pop {
          0%   { transform: scale(0.82); opacity: 0; }
          55%  { transform: scale(1.04); opacity: 1; }
          100% { transform: scale(1);    opacity: 1; }
        }
        @keyframes lsplash-ring {
          0%   { transform: scale(0.7); opacity: 0.55; }
          100% { transform: scale(1.9); opacity: 0; }
        }
        @keyframes lsplash-bar {
          0%   { transform: translateX(-120%); }
          100% { transform: translateX(120%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .lsplash-logo { animation: none !important; opacity: 1 !important; transform: none !important; }
          .lsplash-ring, .lsplash-bar { display: none !important; }
        }
      `}</style>

      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '22px' }}>
        <div style={{ position: 'relative', width: 132, height: 132, display: 'grid', placeItems: 'center' }}>
          {/* expanding brand ring */}
          <div
            className="lsplash-ring"
            style={{
              position: 'absolute',
              width: 132,
              height: 132,
              borderRadius: '30%',
              border: '3px solid #3b6bf5',
              animation: 'lsplash-ring 1.3s ease-out infinite',
            }}
          />
          {/* logo reveal */}
          <img
            src="/logo.jpg"
            alt="Interviewer.AI"
            className="lsplash-logo"
            style={{
              width: 120,
              height: 'auto',
              display: 'block',
              animation: 'lsplash-pop 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) both',
            }}
          />
        </div>

        {/* slim indeterminate progress bar */}
        <div style={{ width: 150, height: 3, borderRadius: 999, background: 'rgba(59,107,245,0.15)', overflow: 'hidden' }}>
          <div
            className="lsplash-bar"
            style={{
              width: '55%',
              height: '100%',
              borderRadius: 999,
              background: 'linear-gradient(90deg, #3b6bf5, #7c5cff)',
              animation: 'lsplash-bar 1.1s ease-in-out infinite',
            }}
          />
        </div>
      </div>
    </div>
  );
}
