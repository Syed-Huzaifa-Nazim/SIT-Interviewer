/**
 * Shared date/time formatting.
 *
 * Dates were being rendered ad hoc across the candidate pages — mostly bare
 * `toLocaleDateString()`, which drops the time entirely and gives no sense of recency. A
 * notification from an hour ago and one from last March both read as a plain date, so the
 * list carried no ordering information the eye could use.
 *
 * Everything here is deliberately Intl-based rather than a date library: the formats below
 * are the only ones the app needs, and pulling in date-fns/dayjs for them would add a
 * dependency to every page that shows a timestamp.
 */

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

const toDate = (value) => {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * "just now" / "12m ago" / "3h ago" / "5d ago", then an absolute date past a week.
 *
 * Relative wording stops at a week on purpose: "63d ago" is harder to place than the date
 * itself, and beyond that the exact day is what someone actually wants.
 */
export const timeAgo = (value) => {
  const d = toDate(value);
  if (!d) return '';

  const seconds = Math.round((Date.now() - d.getTime()) / 1000);

  // Clock skew, or a timestamp the server stamped a moment ahead of this browser. Reading
  // "in 3s" for something that just happened is worse than rounding it to now.
  if (seconds < 45) return 'just now';
  if (seconds < HOUR) return `${Math.round(seconds / MINUTE)}m ago`;
  if (seconds < DAY) return `${Math.round(seconds / HOUR)}h ago`;
  if (seconds < WEEK) return `${Math.round(seconds / DAY)}d ago`;

  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
};

/** "14 Aug 2026, 4:05 PM" — for tooltips and anywhere the exact moment matters. */
export const formatDateTime = (value) => {
  const d = toDate(value);
  if (!d) return '';
  return d.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

/** "14 Aug 2026" — a date with no time, for rows where the hour is noise. */
export const formatDate = (value) => {
  const d = toDate(value);
  if (!d) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

/**
 * "4m 12s" / "1h 05m" from a count of seconds.
 *
 * Interview durations are stored in seconds and were being printed raw, so a candidate saw
 * "752" where they meant to read "12m 32s".
 */
export const formatDuration = (totalSeconds) => {
  const s = Math.max(0, Math.round(Number(totalSeconds) || 0));
  if (s < MINUTE) return `${s}s`;
  const hours = Math.floor(s / HOUR);
  const minutes = Math.floor((s % HOUR) / MINUTE);
  const seconds = s % MINUTE;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
};
