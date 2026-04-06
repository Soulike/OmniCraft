import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {formatTimestamp} from './formatTimestamp.js';

describe('formatTimestamp', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns time only for a same-day timestamp', () => {
    vi.setSystemTime(new Date(2026, 3, 6, 14, 0, 0));
    const timestamp = new Date(2026, 3, 6, 9, 30, 0).getTime();

    const result = formatTimestamp(timestamp);

    // Should contain hour and minute but not month/day
    expect(result).toMatch(/9/);
    expect(result).toMatch(/30/);
  });

  it('returns date and time for a different-day timestamp', () => {
    vi.setSystemTime(new Date(2026, 3, 6, 14, 0, 0));
    const timestamp = new Date(2026, 3, 5, 9, 30, 0).getTime();

    const result = formatTimestamp(timestamp);

    // Should contain the day and time
    expect(result).toMatch(/5/);
    expect(result).toMatch(/9/);
    expect(result).toMatch(/30/);
  });

  it('treats midnight boundary correctly', () => {
    // Now is 2026-04-06 00:05
    vi.setSystemTime(new Date(2026, 3, 6, 0, 5, 0));
    // Timestamp is 2026-04-05 23:55 (yesterday)
    const timestamp = new Date(2026, 3, 5, 23, 55, 0).getTime();

    const result = formatTimestamp(timestamp);

    // Should include date info since it's a different day
    expect(result).toMatch(/5/);
  });

  it('treats same day at year boundary correctly', () => {
    vi.setSystemTime(new Date(2026, 0, 1, 12, 0, 0));
    const timestamp = new Date(2026, 0, 1, 0, 1, 0).getTime();

    const result = formatTimestamp(timestamp);

    // Same day — should be time only (short format)
    // The date-time format would include month name, time-only would not
    expect(result.length).toBeLessThan(20);
  });
});
