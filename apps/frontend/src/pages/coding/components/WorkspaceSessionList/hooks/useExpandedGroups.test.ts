import {act, renderHook} from '@testing-library/react';
import {describe, expect, it} from 'vitest';

import {useExpandedGroups} from './useExpandedGroups.js';

describe('useExpandedGroups', () => {
  it('seeds the expanded set once from the initial active group key', () => {
    const {result, rerender} = renderHook(({key}) => useExpandedGroups(key), {
      initialProps: {key: null as string | null},
    });
    expect(result.current.expandedGroups.size).toBe(0);

    rerender({key: '/a'});
    expect([...result.current.expandedGroups]).toEqual(['/a']);

    // A later active-group change does not re-seed.
    rerender({key: '/b'});
    expect([...result.current.expandedGroups]).toEqual(['/a']);
  });

  it('toggles and expands groups', () => {
    const {result} = renderHook(() => useExpandedGroups(null));

    act(() => {
      result.current.expandGroup('/a');
    });
    expect(result.current.expandedGroups.has('/a')).toBe(true);

    act(() => {
      result.current.toggleGroup('/a', false);
    });
    expect(result.current.expandedGroups.has('/a')).toBe(false);
  });
});
