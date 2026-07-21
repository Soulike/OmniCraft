import {describe, expect, it} from 'vitest';

import {formatRelativeTime} from './format-relative-time.js';

const NOW = Date.parse('2026-07-21T12:00:00.000Z');
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('formatRelativeTime', () => {
  it('returns "just now" under a minute', () => {
    expect(formatRelativeTime(NOW - 30_000, NOW)).toBe('just now');
  });

  it('returns whole minutes', () => {
    expect(formatRelativeTime(NOW - 5 * MIN, NOW)).toBe('5m ago');
  });

  it('returns whole hours', () => {
    expect(formatRelativeTime(NOW - 2 * HOUR, NOW)).toBe('2h ago');
  });

  it('returns "yesterday" between 24 and 48 hours', () => {
    expect(formatRelativeTime(NOW - 30 * HOUR, NOW)).toBe('yesterday');
  });

  it('returns whole days under a week', () => {
    expect(formatRelativeTime(NOW - 3 * DAY, NOW)).toBe('3d ago');
  });

  it('returns a short "Mon D" date beyond a week', () => {
    expect(formatRelativeTime(NOW - 10 * DAY, NOW)).toMatch(
      /^[A-Z][a-z]{2} \d{1,2}$/,
    );
  });
});
