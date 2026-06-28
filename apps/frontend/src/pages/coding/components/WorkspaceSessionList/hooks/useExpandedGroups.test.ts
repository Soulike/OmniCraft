import {act, renderHook} from '@testing-library/react';
import {describe, expect, it} from 'vitest';

import {useExpandedGroups} from './useExpandedGroups.js';

describe('useExpandedGroups', () => {
  it('seeds the expanded set once from the seed key', () => {
    const {result, rerender} = renderHook(({key}) => useExpandedGroups(key), {
      initialProps: {key: null as string | null},
    });
    expect(result.current.expanded.size).toBe(0);

    rerender({key: '/a'});
    expect([...result.current.expanded]).toEqual(['/a']);

    // A later seed-key change does not re-seed.
    rerender({key: '/b'});
    expect([...result.current.expanded]).toEqual(['/a']);
  });

  it('toggles and expands keys', () => {
    const {result} = renderHook(() => useExpandedGroups(null));

    act(() => {
      result.current.expand('/a');
    });
    expect(result.current.expanded.has('/a')).toBe(true);

    act(() => {
      result.current.toggle('/a', false);
    });
    expect(result.current.expanded.has('/a')).toBe(false);
  });
});
