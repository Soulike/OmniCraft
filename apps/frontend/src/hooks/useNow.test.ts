import {act, renderHook} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {useNow} from './useNow.js';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useNow', () => {
  it('returns the initial time, then advances on each interval tick', () => {
    vi.setSystemTime(1_000);
    const {result} = renderHook(() => useNow(5_000));
    expect(result.current).toBe(1_000);

    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(result.current).toBe(6_000);

    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(result.current).toBe(11_000);
  });
});
