import {act, renderHook} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';

import {useNewSessionModal} from './useNewSessionModal.js';

describe('useNewSessionModal', () => {
  it('opens for a workspace', () => {
    const {result} = renderHook(() =>
      useNewSessionModal({
        sendMessageToNewSession: vi.fn().mockResolvedValue('id'),
      }),
    );

    expect(result.current.workspace).toBeNull();

    act(() => {
      result.current.open('/ws');
    });

    expect(result.current.workspace).toBe('/ws');
  });

  it('creates the session, then closes and reports the workspace', async () => {
    const sendMessageToNewSession = vi.fn().mockResolvedValue('new-id');
    const onCreated = vi.fn();
    const {result} = renderHook(() =>
      useNewSessionModal({sendMessageToNewSession, onCreated}),
    );

    act(() => {
      result.current.open('/ws');
    });
    await act(async () => {
      await result.current.submit('do it');
    });

    expect(sendMessageToNewSession).toHaveBeenCalledWith('do it', {
      workspace: '/ws',
    });
    expect(result.current.workspace).toBeNull();
    expect(onCreated).toHaveBeenCalledWith('/ws');
  });

  it('keeps the modal open and does not report when creation fails (resolves null)', async () => {
    const sendMessageToNewSession = vi.fn().mockResolvedValue(null);
    const onCreated = vi.fn();
    const {result} = renderHook(() =>
      useNewSessionModal({sendMessageToNewSession, onCreated}),
    );

    act(() => {
      result.current.open('/ws');
    });
    await act(async () => {
      await result.current.submit('do it');
    });

    expect(result.current.workspace).toBe('/ws');
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('submit is a no-op when the modal is closed', async () => {
    const sendMessageToNewSession = vi.fn().mockResolvedValue('id');
    const {result} = renderHook(() =>
      useNewSessionModal({sendMessageToNewSession}),
    );

    await act(async () => {
      await result.current.submit('do it');
    });

    expect(sendMessageToNewSession).not.toHaveBeenCalled();
  });
});
