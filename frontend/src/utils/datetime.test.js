import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { timeAgo, formatDuration, formatDate, formatDateTime } from './datetime';

/**
 * These formatters are read on every page that shows a timestamp, so the edge cases that
 * matter are the ones that would otherwise print something nonsensical to a candidate:
 * a null value, a future timestamp from clock skew, or a raw second count.
 */

const AT = new Date('2026-08-14T12:00:00Z');
const ago = (seconds) => new Date(AT.getTime() - seconds * 1000).toISOString();

describe('timeAgo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(AT);
  });
  afterEach(() => vi.useRealTimers());

  it.each([
    [0, 'just now'],
    [30, 'just now'],
    [120, '2m ago'],
    [3 * 3600, '3h ago'],
    [2 * 86400, '2d ago'],
  ])('renders %ss ago as "%s"', (seconds, expected) => {
    expect(timeAgo(ago(seconds))).toBe(expected);
  });

  it('switches to an absolute date past a week', () => {
    // "63d ago" is harder to place than the date itself.
    const result = timeAgo(ago(60 * 86400));
    expect(result).not.toMatch(/ago/);
    expect(result).toMatch(/Jun/);
  });

  it('reads a slightly-future timestamp as now rather than negative', () => {
    // Server clocks run a moment ahead of the browser often enough to matter; "in -3s" or
    // "-1m ago" is worse than rounding to now.
    expect(timeAgo(new Date(AT.getTime() + 5000).toISOString())).toBe('just now');
  });

  it.each([null, undefined, '', 'not a date'])('returns empty for %s', (value) => {
    expect(timeAgo(value)).toBe('');
  });
});

describe('formatDuration', () => {
  it.each([
    [0, '0s'],
    [45, '45s'],
    [90, '1m 30s'],
    [752, '12m 32s'],
    [3600, '1h 00m'],
    [5430, '1h 30m'],
  ])('renders %s seconds as "%s"', (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });

  it.each([null, undefined, 'abc', -10])('clamps %s to zero rather than printing NaN', (value) => {
    expect(formatDuration(value)).toBe('0s');
  });
});

describe('formatDate / formatDateTime', () => {
  it('returns empty for a missing value instead of "Invalid Date"', () => {
    expect(formatDate(null)).toBe('');
    expect(formatDateTime(undefined)).toBe('');
    expect(formatDate('nonsense')).toBe('');
  });

  it('includes the year and a time where each is expected', () => {
    const iso = '2026-08-14T12:00:00Z';
    expect(formatDate(iso)).toMatch(/2026/);
    expect(formatDateTime(iso)).toMatch(/2026/);
    // A time component distinguishes it from formatDate.
    expect(formatDateTime(iso)).toMatch(/\d:\d{2}/);
  });
});
