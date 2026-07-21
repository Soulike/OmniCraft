import {renderHook} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';

import {useNow} from './useNow.js';

describe('useNow', () => {
  it('returns the mount-time timestamp and keeps it stable across re-renders', () => {
    vi.setSystemTime(1_000_000);
    const {result, rerender} = renderHook(() => useNow());
    expect(result.current).toBe(1_000_000);

    vi.setSystemTime(2_000_000);
    rerender();
    expect(result.current).toBe(1_000_000);

    vi.useRealTimers();
  });
});
