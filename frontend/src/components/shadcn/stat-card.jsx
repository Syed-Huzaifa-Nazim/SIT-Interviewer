import * as React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CountUp, SpotlightCard, StaggerItem } from './motion';
import { Skeleton } from './misc';

const TONES = {
  primary: { ring: 'bg-primary/10 text-primary', bar: 'bg-primary', glow: 'rgba(13,109,183,0.14)' },
  success: { ring: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', bar: 'bg-emerald-500', glow: 'rgba(16,163,74,0.14)' },
  warning: { ring: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', bar: 'bg-amber-500', glow: 'rgba(217,119,6,0.14)' },
  danger: { ring: 'bg-red-500/10 text-red-600 dark:text-red-400', bar: 'bg-red-500', glow: 'rgba(220,38,38,0.14)' },
  accent: { ring: 'bg-accent-500/15 text-accent-700 dark:text-accent-400', bar: 'bg-accent-500', glow: 'rgba(141,198,63,0.16)' },
  neutral: { ring: 'bg-muted text-muted-foreground', bar: 'bg-muted-foreground', glow: 'rgba(100,116,139,0.12)' },
};

/**
 * Headline metric tile for the Admin Hub.
 *
 * `value` counts up on mount/change; pass `formatted` instead when the figure is not a
 * plain number (a duration, a ratio) and should render verbatim.
 *
 * `delta` is the change versus the previous period. Its colour is decided by
 * `deltaGood` rather than by sign, because "up" is not universally good — more
 * terminated interviews rising is bad news, and colouring that green would actively
 * mislead someone scanning the dashboard.
 */
function StatCard({
  label,
  value,
  formatted,
  suffix = '',
  prefix = '',
  decimals = 0,
  icon: Icon,
  tone = 'primary',
  delta,
  deltaGood = 'up',
  hint,
  loading = false,
  index = 0,
  className,
  footer,
}) {
  const t = TONES[tone] || TONES.primary;

  if (loading) {
    return (
      <div className={cn('rounded-xl border border-border bg-card p-5', className)}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-20" />
          </div>
          <Skeleton className="size-10 rounded-lg" />
        </div>
      </div>
    );
  }

  const deltaNum = typeof delta === 'number' ? delta : null;
  const isFlat = deltaNum === null || deltaNum === 0;
  const isUp = deltaNum !== null && deltaNum > 0;
  const good = isFlat ? null : deltaGood === 'up' ? isUp : !isUp;
  const DeltaIcon = isFlat ? Minus : isUp ? TrendingUp : TrendingDown;

  return (
    <StaggerItem index={index}>
      <SpotlightCard spotlightColor={t.glow} className={cn('h-full', className)}>
        {/* Tone strip: identifies the metric family at a glance without adding a label. */}
        <span aria-hidden className={cn('absolute inset-x-0 top-0 h-0.5', t.bar)} />
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground truncate">{label}</p>
              <div className="mt-1.5 text-3xl font-extrabold tracking-tight text-foreground">
                {formatted !== undefined ? (
                  formatted
                ) : (
                  <CountUp value={Number(value) || 0} decimals={decimals} prefix={prefix} suffix={suffix} />
                )}
              </div>
            </div>
            {Icon && (
              <span
                className={cn(
                  'grid size-10 shrink-0 place-items-center rounded-lg transition-transform duration-300 group-hover:scale-110',
                  t.ring
                )}
              >
                <Icon className="size-5" />
              </span>
            )}
          </div>

          {(deltaNum !== null || hint || footer) && (
            <div className="mt-3 flex items-center gap-2 text-xs">
              {deltaNum !== null && (
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold',
                    good === null && 'bg-muted text-muted-foreground',
                    good === true && 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                    good === false && 'bg-red-500/10 text-red-600 dark:text-red-400'
                  )}
                >
                  <DeltaIcon className="size-3" />
                  {Math.abs(deltaNum)}
                  {suffix === '%' ? '%' : ''}
                </span>
              )}
              {hint && <span className="text-muted-foreground truncate">{hint}</span>}
              {footer}
            </div>
          )}
        </div>
      </SpotlightCard>
    </StaggerItem>
  );
}

/** Responsive grid wrapper so every dashboard row of tiles lines up identically. */
function StatGrid({ children, className, cols = 4 }) {
  return (
    <div
      className={cn(
        'grid gap-4',
        cols === 2 && 'grid-cols-1 sm:grid-cols-2',
        cols === 3 && 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
        cols === 4 && 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4',
        className
      )}
    >
      {children}
    </div>
  );
}

export { StatCard, StatGrid, TONES };
