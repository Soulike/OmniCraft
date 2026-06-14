import {renderHook} from '@testing-library/react';
import {describe, expect, it} from 'vitest';

import {useNavigationSheen} from './useNavigationSheen.js';

describe('useNavigationSheen', () => {
  it('returns null on first render (no sheen on initial load)', () => {
    const {result} = renderHook(() => useNavigationSheen('chat'));
    expect(result.current).toBeNull();
  });

  it('stays null when re-rendered with the same id (no spurious sheen)', () => {
    const {result, rerender} = renderHook(({id}) => useNavigationSheen(id), {
      initialProps: {id: 'chat'},
    });
    rerender({id: 'chat'});
    expect(result.current).toBeNull();
  });

  it('returns the new id after a navigation changes the selection', () => {
    const {result, rerender} = renderHook(({id}) => useNavigationSheen(id), {
      initialProps: {id: 'chat'},
    });
    expect(result.current).toBeNull();
    rerender({id: 'coding'});
    expect(result.current).toBe('coding');
  });
});
