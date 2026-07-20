import {renderHook} from '@testing-library/react';
import {describe, expect, it} from 'vitest';

import {useNavigationPop} from './useNavigationPop.js';

describe('useNavigationPop', () => {
  it('returns null on first render (no pop on initial load)', () => {
    const {result} = renderHook(() => useNavigationPop('chat'));
    expect(result.current).toBeNull();
  });

  it('stays null when re-rendered with the same id (no spurious pop)', () => {
    const {result, rerender} = renderHook(({id}) => useNavigationPop(id), {
      initialProps: {id: 'chat'},
    });
    rerender({id: 'chat'});
    expect(result.current).toBeNull();
  });

  it('returns the new id after a navigation changes the selection', () => {
    const {result, rerender} = renderHook(({id}) => useNavigationPop(id), {
      initialProps: {id: 'chat'},
    });
    expect(result.current).toBeNull();
    rerender({id: 'coding'});
    expect(result.current).toBe('coding');
  });
});
