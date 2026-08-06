import * as React from 'react';
import { motion, useInView, useMotionValue, useSpring, useReducedMotion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';

/**
 * Motion layer for the Admin Hub.
 *
 * Every component here checks `useReducedMotion()` and degrades to a static render.
 * The global `prefers-reduced-motion` rule in index.css already neutralises CSS
 * animation, but motion drives transforms from JavaScript, which that rule cannot
 * reach — so the check has to happen here too.
 */

/* --------------------------------------------------------------- transitions */

const EASE = [0.22, 1, 0.36, 1];

/** Page-level entrance. Wrap a route's content once, near the top. */
function PageTransition({ children, className }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/**
 * Staggered list entrance. `index` drives the delay, capped so a 200-row table does not
 * end up with a 20-second cascade — past ~12 items the effect is no longer perceptible
 * as sequence, only as lag.
 */
function StaggerItem({ children, index = 0, className, step = 0.04, max = 12 }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE, delay: Math.min(index, max) * step }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** Same idea for table rows, where the wrapper must stay a <tr>. */
function StaggerRow({ children, index = 0, className, ...props }) {
  const reduce = useReducedMotion();
  if (reduce) return <tr className={className} {...props}>{children}</tr>;
  return (
    <motion.tr
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25, delay: Math.min(index, 15) * 0.025 }}
      className={className}
      {...props}
    >
      {children}
    </motion.tr>
  );
}

/** Reveal on scroll — for long report pages where content below the fold benefits from
 *  arriving as the reader reaches it. `once` so it never re-animates on scroll-back. */
function Reveal({ children, className, delay = 0, y = 16 }) {
  const ref = React.useRef(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.45, ease: EASE, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ counters */

/**
 * Count-up number. Springs to `value` whenever it changes, so a stat that refreshes
 * animates from its previous figure instead of restarting from zero.
 */
function CountUp({ value = 0, decimals = 0, suffix = '', prefix = '', className }) {
  const reduce = useReducedMotion();
  const motionValue = useMotionValue(0);
  const spring = useSpring(motionValue, { stiffness: 90, damping: 20, mass: 0.6 });
  const [display, setDisplay] = React.useState(() => Number(value) || 0);

  React.useEffect(() => {
    if (reduce) {
      setDisplay(Number(value) || 0);
      return undefined;
    }
    motionValue.set(Number(value) || 0);
    const unsubscribe = spring.on('change', (v) => setDisplay(v));
    return unsubscribe;
  }, [value, motionValue, spring, reduce]);

  return (
    <span className={cn('tabular-nums', className)}>
      {prefix}
      {display.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
    </span>
  );
}

/* -------------------------------------------------------------------- surfaces */

/**
 * Card that lifts and follows the cursor with a soft spotlight.
 *
 * The spotlight is painted with a CSS radial-gradient positioned from two custom
 * properties updated on mousemove. Writing to CSS variables (rather than React state)
 * keeps the pointer handler off the render path — a state update per mousemove would
 * re-render the whole card dozens of times a second.
 */
function SpotlightCard({ children, className, spotlightColor = 'rgba(13,109,183,0.12)', lift = true }) {
  const ref = React.useRef(null);
  const reduce = useReducedMotion();

  const handleMove = React.useCallback(
    (e) => {
      const el = ref.current;
      if (!el || reduce) return;
      const rect = el.getBoundingClientRect();
      el.style.setProperty('--spot-x', `${e.clientX - rect.left}px`);
      el.style.setProperty('--spot-y', `${e.clientY - rect.top}px`);
      el.style.setProperty('--spot-opacity', '1');
    },
    [reduce]
  );

  const handleLeave = React.useCallback(() => {
    ref.current?.style.setProperty('--spot-opacity', '0');
  }, []);

  return (
    <div
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      style={{ '--spot-opacity': 0 }}
      className={cn(
        'group relative overflow-hidden rounded-xl border border-border bg-card transition-all duration-300',
        lift && !reduce && 'hover:-translate-y-1 hover:shadow-lg hover:border-primary/30',
        className
      )}
    >
      {!reduce && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 transition-opacity duration-300"
          style={{
            opacity: 'var(--spot-opacity)',
            background: `radial-gradient(340px circle at var(--spot-x) var(--spot-y), ${spotlightColor}, transparent 70%)`,
          }}
        />
      )}
      <div className="relative">{children}</div>
    </div>
  );
}

/**
 * Card wrapped in a slowly rotating conic-gradient border.
 *
 * Reserved for the one or two cards that genuinely deserve emphasis — used on every
 * card it stops reading as emphasis and just becomes visual noise.
 */
function GradientBorderCard({ children, className, innerClassName, active = true }) {
  const reduce = useReducedMotion();
  const animate = active && !reduce;
  return (
    <div
      className={cn('relative rounded-xl p-px', className)}
      style={
        animate
          ? {
              background:
                'conic-gradient(from var(--admin-angle), var(--color-primary-600), var(--color-accent-500), var(--color-primary-400), var(--color-primary-600))',
              animation: 'admin-border-spin 6s linear infinite',
            }
          : { background: 'var(--color-border)' }
      }
    >
      <div className={cn('h-full w-full rounded-[calc(var(--radius)-1px)] bg-card', innerClassName)}>{children}</div>
    </div>
  );
}

/** Animated aurora backdrop for page headers. Purely decorative, so aria-hidden. */
function AuroraBackdrop({ className }) {
  const reduce = useReducedMotion();
  return (
    <div aria-hidden className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      <div
        className={cn(
          'absolute -top-24 -left-16 size-72 rounded-full bg-primary/20 blur-3xl',
          !reduce && 'animate-[aurora-drift_12s_ease_infinite]'
        )}
      />
      <div
        className={cn(
          'absolute -top-16 right-0 size-72 rounded-full bg-accent-500/20 blur-3xl',
          !reduce && 'animate-[aurora-drift_15s_ease_infinite_reverse]'
        )}
      />
    </div>
  );
}

export {
  motion,
  AnimatePresence,
  useReducedMotion,
  PageTransition,
  StaggerItem,
  StaggerRow,
  Reveal,
  CountUp,
  SpotlightCard,
  GradientBorderCard,
  AuroraBackdrop,
  EASE,
};
