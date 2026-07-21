import {act, renderHook, waitFor} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';

import {useTaskDeletion} from './useTaskDeletion.js';

describe('useTaskDeletion', () => {
  it('opens, runs onDelete, then closes', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    const {result} = renderHook(() => useTaskDeletion(onDelete));

    act(() => {
      result.current.onDeleteOpenChange(true);
    });
    expect(result.current.isDeleteOpen).toBe(true);

    act(() => {
      result.current.onConfirmDelete();
    });
    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(result.current.isDeleteOpen).toBe(false);
    });
    expect(result.current.isDeleting).toBe(false);
  });

  it('recovers from a rejecting onDelete without leaving state stuck', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const onDelete = vi.fn().mockRejectedValue(new Error('boom'));
    const {result} = renderHook(() => useTaskDeletion(onDelete));

    act(() => {
      result.current.onDeleteOpenChange(true);
    });
    act(() => {
      result.current.onConfirmDelete();
    });

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(result.current.isDeleting).toBe(false);
    });
    expect(result.current.isDeleteOpen).toBe(false);
    expect(consoleError).toHaveBeenCalledTimes(1);

    consoleError.mockRestore();
  });
});
