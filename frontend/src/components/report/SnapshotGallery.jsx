import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import api from '../../services/api';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/shadcn/badge';
import { Button } from '@/components/shadcn/button';
import Spinner from '../ui/Spinner';
import { ChevronLeft, ChevronRight, Maximize2, ShieldAlert, X, Camera, Monitor } from 'lucide-react';

/**
 * Proctoring evidence viewer: one large frame with a filmstrip beneath it.
 *
 * Clicking a thumbnail promotes it into the hero slot rather than opening a modal —
 * reviewing evidence means comparing frames in sequence, and a modal that has to be
 * dismissed between every image turns that into a chore. The fullscreen view is still
 * there for close inspection, via the hero itself or the expand control.
 *
 * Signed URLs are short-lived, so they are fetched per image and cached for the session;
 * only the hero and the visible strip are ever requested.
 */
const SnapshotGallery = ({ snapshots, className }) => {
  const [heroIndex, setHeroIndex] = useState(0);
  const [urls, setUrls] = useState({});
  const [failed, setFailed] = useState({});
  const [fullscreen, setFullscreen] = useState(false);

  const ensureUrl = useCallback(
    (snap) => {
      if (!snap || urls[snap.id] || failed[snap.id]) return;
      api
        .get(`/admin/proctor-snapshots/${snap.id}/url`)
        .then((res) => setUrls((prev) => ({ ...prev, [snap.id]: res.data.image_url })))
        .catch(() => setFailed((prev) => ({ ...prev, [snap.id]: true })));
    },
    [urls, failed]
  );

  // Fetch the hero plus its immediate neighbours, so stepping through the strip does not
  // pause on a spinner for every single frame.
  useEffect(() => {
    if (!snapshots.length) return;
    [heroIndex - 1, heroIndex, heroIndex + 1]
      .filter((i) => i >= 0 && i < snapshots.length)
      .forEach((i) => ensureUrl(snapshots[i]));
  }, [heroIndex, snapshots, ensureUrl]);

  // The strip is short enough that loading every thumbnail up front is cheaper than
  // managing virtualisation, and it makes the filmstrip readable immediately.
  useEffect(() => {
    snapshots.slice(0, 12).forEach(ensureUrl);
  }, [snapshots, ensureUrl]);

  const step = useCallback(
    (delta) => setHeroIndex((i) => (i + delta + snapshots.length) % snapshots.length),
    [snapshots.length]
  );

  useEffect(() => {
    if (!fullscreen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setFullscreen(false);
      if (e.key === 'ArrowLeft') step(-1);
      if (e.key === 'ArrowRight') step(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen, step]);

  if (!snapshots.length) return null;

  const hero = snapshots[heroIndex];
  const heroUrl = urls[hero?.id];
  const isWebcam = hero?.kind === 'termination';

  const KindBadge = ({ snap, ...rest }) => (
    <Badge variant={snap?.kind === 'termination' ? 'destructive' : 'info'} size="sm" {...rest}>
      {snap?.kind === 'termination' ? <Camera /> : <Monitor />}
      {snap?.kind === 'termination' ? 'Webcam' : 'Screen'}
    </Badge>
  );

  return (
    <div className={cn('flex min-h-0 flex-col gap-2', className)}>
      {/* ------------------------------------------------------------------ hero */}
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-slate-950">
        {heroUrl ? (
          <img
            src={heroUrl}
            alt={`Proctoring frame ${heroIndex + 1}`}
            className="size-full cursor-zoom-in object-contain"
            onClick={() => setFullscreen(true)}
          />
        ) : failed[hero?.id] ? (
          <div className="grid size-full place-items-center px-4 text-center text-xs text-destructive">
            This snapshot could not be loaded.
          </div>
        ) : (
          <div className="grid size-full place-items-center">
            <Spinner size="sm" />
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2">
          <KindBadge snap={hero} className="pointer-events-auto" />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="View fullscreen"
            onClick={() => setFullscreen(true)}
            className="pointer-events-auto bg-slate-900/60 text-white hover:bg-slate-900/80"
          >
            <Maximize2 />
          </Button>
        </div>

        {snapshots.length > 1 && (
          <>
            <button
              type="button"
              aria-label="Previous frame"
              onClick={() => step(-1)}
              className="absolute left-2 top-1/2 -translate-y-1/2 cursor-pointer rounded-full bg-slate-900/60 p-1.5 text-white transition hover:bg-slate-900/85"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Next frame"
              onClick={() => step(1)}
              className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer rounded-full bg-slate-900/60 p-1.5 text-white transition hover:bg-slate-900/85"
            >
              <ChevronRight className="size-4" />
            </button>
          </>
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-slate-950/85 to-transparent px-3 py-2 text-[10px] text-slate-200">
          <span className="truncate">
            {hero?.label ? `${hero.label} · ` : ''}
            {hero?.captured_at ? new Date(hero.captured_at).toLocaleString() : ''}
          </span>
          <span className="shrink-0 font-mono">
            {heroIndex + 1}/{snapshots.length}
          </span>
        </div>
      </div>

      {/* ------------------------------------------------------------- filmstrip */}
      <div className="flex shrink-0 gap-1.5 overflow-x-auto pb-1">
        {snapshots.map((snap, idx) => {
          const active = idx === heroIndex;
          return (
            <button
              key={snap.id}
              type="button"
              onClick={() => setHeroIndex(idx)}
              aria-label={`Show frame ${idx + 1}`}
              aria-current={active}
              title={`${snap.kind === 'termination' ? 'Webcam' : 'Screen'} · ${new Date(snap.captured_at).toLocaleTimeString()}`}
              className={cn(
                'relative aspect-video h-14 shrink-0 cursor-pointer overflow-hidden rounded-md border-2 bg-muted transition',
                active
                  ? 'border-primary ring-2 ring-primary/25'
                  : 'border-transparent opacity-65 hover:opacity-100'
              )}
            >
              {urls[snap.id] ? (
                <img src={urls[snap.id]} alt="" className="size-full object-cover" />
              ) : (
                <span className="grid size-full place-items-center">
                  <Spinner size="sm" />
                </span>
              )}
              <span
                className={cn(
                  'absolute bottom-0 inset-x-0 h-0.5',
                  snap.kind === 'termination' ? 'bg-destructive' : 'bg-sky-500'
                )}
              />
            </button>
          );
        })}
      </div>

      {/* ------------------------------------------------------------ fullscreen */}
      {fullscreen &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex flex-col bg-slate-950/95 p-4 backdrop-blur-sm"
            onClick={() => setFullscreen(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Proctoring snapshot, fullscreen"
          >
            <div className="flex shrink-0 items-center justify-between gap-3 pb-3 text-slate-200">
              <span className="flex items-center gap-2 text-sm font-bold">
                <ShieldAlert className="size-4" /> Proctoring Evidence
                <KindBadge snap={hero} />
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Close"
                onClick={() => setFullscreen(false)}
                className="text-slate-200 hover:bg-slate-800"
              >
                <X />
              </Button>
            </div>

            <div className="relative flex min-h-0 flex-1 items-center justify-center" onClick={(e) => e.stopPropagation()}>
              {heroUrl ? (
                <img src={heroUrl} alt="" className="max-h-full max-w-full object-contain" />
              ) : (
                <Spinner />
              )}
              {snapshots.length > 1 && (
                <>
                  <button
                    type="button"
                    aria-label="Previous frame"
                    onClick={() => step(-1)}
                    className="absolute left-2 cursor-pointer rounded-full bg-slate-900/70 p-2 text-white hover:bg-slate-800"
                  >
                    <ChevronLeft className="size-5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next frame"
                    onClick={() => step(1)}
                    className="absolute right-2 cursor-pointer rounded-full bg-slate-900/70 p-2 text-white hover:bg-slate-800"
                  >
                    <ChevronRight className="size-5" />
                  </button>
                </>
              )}
            </div>

            <div className="shrink-0 pt-3 text-center text-xs text-slate-400" onClick={(e) => e.stopPropagation()}>
              {hero?.captured_at ? new Date(hero.captured_at).toLocaleString() : ''} · {heroIndex + 1} of{' '}
              {snapshots.length} · Use ← → to step, Esc to close
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default SnapshotGallery;
