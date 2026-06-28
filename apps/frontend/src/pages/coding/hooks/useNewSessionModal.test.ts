import {act, renderHook} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';

import {useNewSessionModal} from './useNewSessionModal.js';

describe('useNewSessionModal', () => {
  it('opens for a workspace and notifies onOpen', () => {
    const onOpen = vi.fn();
    const {result} = renderHook(() =>
      useNewSessionModal({
        sendMessageToNewSession: vi.fn().mockResolvedValue('id'),
        onOpen,
      }),
    );

    expect(result.current.workspace).toBeNull();

    act(() => {
      result.current.open('/ws');
    });

    expect(result.current.workspace).toBe('/ws');
    expect(onOpen).toHaveBeenCalledWith('/ws');
  });

  it('submit creates the session in the target workspace, then closes', async () => {
    const sendMessageToNewSession = vi.fn().mockResolvedValue('id');
    const onSubmitted = vi.fn();
    const {result} = renderHook(() =>
      useNewSessionModal({sendMessageToNewSession, onSubmitted}),
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
    expect(onSubmitted).toHaveBeenCalledTimes(1);
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
