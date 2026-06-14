import {renderHook} from '@testing-library/react';
import {beforeAll, describe, expect, it, vi} from 'vitest';

import {useActiveIndicator} from './useActiveIndicator.js';

class ResizeObserverStub implements ResizeObserver {
  disconnect = vi.fn();
  observe = vi.fn();
  unobserve = vi.fn();
}

beforeAll(() => {
  globalThis.ResizeObserver = ResizeObserverStub;
});

describe('useActiveIndicator', () => {
  it('returns a list ref and a null indicator before any element is measured', () => {
    const {result} = renderHook(() => useActiveIndicator('chat'));
    expect(result.current.listRef).toHaveProperty('current');
    expect(result.current.indicator).toBeNull();
  });
});
