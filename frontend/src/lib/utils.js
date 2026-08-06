import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge class names, letting later Tailwind utilities win over earlier conflicting ones.
 *
 * `clsx` flattens conditionals/arrays/objects into a string; `twMerge` then resolves
 * Tailwind conflicts so a caller's `className` can genuinely override a component's
 * defaults (plain string concatenation would leave both `px-4` and `px-8` in the class
 * list and let source order in the stylesheet decide, which is not what callers expect).
 *
 * This is the standard `cn()` every shadcn component is written against.
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/** Clamp a number into [min, max]. Used by score meters and chart domains. */
export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Format a 0-100 score for display. Returns an em dash for null/undefined so report
 * tables show a deliberate "no data" mark rather than "0" (which reads as a real score).
 */
export function formatScore(value, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return Number(value).toFixed(digits);
}
