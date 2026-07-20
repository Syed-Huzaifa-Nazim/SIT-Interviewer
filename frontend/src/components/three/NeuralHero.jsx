import React, { useEffect, useRef, useState } from 'react';
import { useTheme } from '../../context/ThemeContext';

/**
 * Abstract particle/node network representing real-time AI evaluation — nodes (candidate
 * signals) linked by edges (the model reasoning across them), gently rotating with a subtle
 * mouse-parallax tilt. This component only handles the React lifecycle and UI states; the
 * actual scene lives in `./neuralScene.js`, which uses static named imports from `three` so
 * Rollup can tree-shake it down to just the classes it references instead of bundling the
 * entire library. Both are reached only through the dynamic `import('./neuralScene')` below,
 * so the whole thing lands in its own lazy-loaded chunk that never blocks the hero text/CTAs
 * above it, and is only fetched by visitors who land on a page rendering this component
 * (Home only, §1.2).
 *
 * Three states, each rendered as the same full-bleed absolutely-positioned layer so there is
 * no layout shift when swapping between them:
 *   1. 'loading'   — CSS gradient placeholder while the chunk fetches + scene initializes.
 *   2. 'fallback'  — WebGL unavailable (or context creation failed): a static, still-premium
 *                    CSS gradient composition, never a broken/blank canvas.
 *   3. 'ready'     — the live Three.js canvas. If prefers-reduced-motion is set, the scene
 *                    still renders (one frame) but the rotation/pulse/parallax loop never
 *                    starts, per §1.2.
 */

const STATIC_FALLBACK = (
  <div className="absolute inset-0 overflow-hidden">
    <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-primary-500/20 dark:bg-primary-500/10 rounded-full blur-3xl" />
    <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent-500/20 dark:bg-accent-500/10 rounded-full blur-3xl" />
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(148,163,184,0.25)_1px,transparent_0)] bg-[length:28px_28px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,black_10%,transparent_75%)]" />
  </div>
);

const supportsWebGL = () => {
  try {
    const canvas = document.createElement('canvas');
    return !!(window.WebGLRenderingContext &&
      (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
  } catch {
    return false;
  }
};

const NeuralHero = () => {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const [status, setStatus] = useState('loading'); // 'loading' | 'fallback' | 'ready'
  const { isDark } = useTheme();

  useEffect(() => {
    if (!supportsWebGL()) {
      setStatus('fallback');
      return;
    }

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let cancelled = false;

    (async () => {
      let mod;
      try {
        mod = await import('./neuralScene');
      } catch {
        if (!cancelled) setStatus('fallback');
        return;
      }
      if (cancelled || !containerRef.current) return;

      let handle;
      try {
        handle = mod.createNeuralScene(containerRef.current, { isDark, reduceMotion });
      } catch {
        setStatus('fallback');
        return;
      }

      sceneRef.current = handle;
      if (!cancelled) setStatus('ready');
    })();

    return () => {
      cancelled = true;
      sceneRef.current?.cleanup();
      sceneRef.current = null;
    };
    // Scene is built once; theme colour updates are pushed via the effect below instead of
    // rebuilding the whole scene (cheap, no re-init flicker).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Theme toggle: update existing materials in place rather than tearing down the scene.
  useEffect(() => {
    sceneRef.current?.updateTheme(isDark);
  }, [isDark]);

  return (
    <div className="relative w-full h-full min-h-[320px]">
      {status !== 'ready' && (
        <div className="absolute inset-0 transition-opacity duration-500">{STATIC_FALLBACK}</div>
      )}
      <div
        ref={containerRef}
        className={`absolute inset-0 transition-opacity duration-700 ${status === 'ready' ? 'opacity-100' : 'opacity-0'}`}
      />
    </div>
  );
};

export default NeuralHero;
