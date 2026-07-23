import type {McpServer} from '@omnicraft/settings-schema';
import {act, renderHook} from '@testing-library/react';
import {describe, expect, it} from 'vitest';

import {useServerFormModal} from './useServerFormModal.js';

const server: McpServer = {
  name: 'fs',
  transport: {type: 'stdio', command: 'npx', args: [], env: {}},
};

describe('useServerFormModal', () => {
  it('starts closed in add mode', () => {
    const {result} = renderHook(() => useServerFormModal());
    expect(result.current.isOpen).toBe(false);
    expect(result.current.mode).toBe('add');
  });

  it('opens for add with no target and bumps instanceId', () => {
    const {result} = renderHook(() => useServerFormModal());
    const before = result.current.instanceId;
    act(() => {
      result.current.openAdd();
    });
    expect(result.current.isOpen).toBe(true);
    expect(result.current.mode).toBe('add');
    expect(result.current.target).toBeUndefined();
    expect(result.current.instanceId).toBe(before + 1);
  });

  it('opens for edit with the target server', () => {
    const {result} = renderHook(() => useServerFormModal());
    act(() => {
      result.current.openEdit(server);
    });
    expect(result.current.isOpen).toBe(true);
    expect(result.current.mode).toBe('edit');
    expect(result.current.target).toEqual(server);
  });

  it('closes', () => {
    const {result} = renderHook(() => useServerFormModal());
    act(() => {
      result.current.openAdd();
    });
    act(() => {
      result.current.close();
    });
    expect(result.current.isOpen).toBe(false);
  });

  it('bumps instanceId on each open', () => {
    const {result} = renderHook(() => useServerFormModal());
    act(() => {
      result.current.openAdd();
    });
    const first = result.current.instanceId;
    act(() => {
      result.current.openAdd();
    });
    expect(result.current.instanceId).toBe(first + 1);
  });
});
