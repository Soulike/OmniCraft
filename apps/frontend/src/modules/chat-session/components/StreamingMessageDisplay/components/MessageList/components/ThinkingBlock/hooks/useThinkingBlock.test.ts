import {act, renderHook} from '@testing-library/react';
import {describe, expect, it} from 'vitest';

import {useThinkingBlock} from './useThinkingBlock.js';

describe('useThinkingBlock', () => {
  it('starts expanded while thinking is streaming', () => {
    const {result} = renderHook(() => useThinkingBlock());

    expect(result.current.isExpanded).toBe(true);
  });

  it('keeps the current expansion state after rerendering', () => {
    const {result, rerender} = renderHook(() => useThinkingBlock());

    expect(result.current.isExpanded).toBe(true);

    rerender();

    expect(result.current.isExpanded).toBe(true);
  });

  it('keeps user-collapsed thinking collapsed after rerendering', () => {
    const {result, rerender} = renderHook(() => useThinkingBlock());

    act(() => {
      result.current.onExpandedChange(false);
    });

    rerender();

    expect(result.current.isExpanded).toBe(false);
  });

  it('starts expanded for already completed thinking', () => {
    const {result} = renderHook(() => useThinkingBlock());

    expect(result.current.isExpanded).toBe(true);
  });
});
