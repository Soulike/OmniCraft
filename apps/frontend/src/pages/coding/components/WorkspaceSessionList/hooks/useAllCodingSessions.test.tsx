import {act, renderHook, waitFor} from '@testing-library/react';
import type {ReactNode} from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';

import type {ChatSessionApi} from '@/modules/chat-session/index.js';
import {
  ChatEventBusProvider,
  ChatSessionApiContext,
  useChatEventBus,
} from '@/modules/chat-session/index.js';

import {useAllCodingSessions} from './useAllCodingSessions.js';

const listSessions = vi.fn();
const deleteSession = vi.fn();

const api = {listSessions, deleteSession} as unknown as ChatSessionApi;

function wrapper({children}: {children: ReactNode}) {
  return (
    <ChatSessionApiContext value={api}>
      <ChatEventBusProvider>{children}</ChatEventBusProvider>
    </ChatSessionApiContext>
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('useAllCodingSessions', () => {
  it('loads all sessions on mount via one unbounded page', async () => {
    listSessions.mockResolvedValue({
      sessions: [{id: 's1', title: 'One'}],
      total: 1,
    });

    const {result} = renderHook(() => useAllCodingSessions(), {wrapper});

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(listSessions).toHaveBeenCalledWith(0, Number.MAX_SAFE_INTEGER);
    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  it('refetches in the background when a turn completes (done)', async () => {
    listSessions.mockResolvedValue({sessions: [], total: 0});
    const {result} = renderHook(
      () => ({list: useAllCodingSessions(), bus: useChatEventBus()}),
      {wrapper},
    );
    await waitFor(() => {
      expect(result.current.list.isLoading).toBe(false);
    });
    expect(listSessions).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.bus.emit('done', {type: 'done', reason: 'complete'});
    });

    await waitFor(() => {
      expect(listSessions).toHaveBeenCalledTimes(2);
    });
  });

  it('removeSession deletes then reloads', async () => {
    listSessions.mockResolvedValue({sessions: [], total: 0});
    deleteSession.mockResolvedValue(undefined);

    const {result} = renderHook(() => useAllCodingSessions(), {wrapper});
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await result.current.removeSession('s1');

    expect(deleteSession).toHaveBeenCalledWith('s1');
    expect(listSessions).toHaveBeenCalledTimes(2);
  });

  it('discards a stale response that resolves after a newer reload', async () => {
    // Mount load resolves late with []; a newer reload resolves first with s1.
    let resolveStale!: (value: unknown) => void;
    const stale = new Promise((resolve) => {
      resolveStale = resolve;
    });
    listSessions
      .mockReturnValueOnce(stale)
      .mockResolvedValueOnce({sessions: [{id: 's1', title: 'One'}], total: 1});

    const {result} = renderHook(() => useAllCodingSessions(), {wrapper});

    // Newer reload wins while the mount load is still pending.
    await act(async () => {
      await result.current.reload(true);
    });
    expect(result.current.sessions).toEqual([{id: 's1', title: 'One'}]);

    // The stale mount load resolves last and must NOT overwrite the newer data.
    await act(async () => {
      resolveStale({sessions: [], total: 0});
      await stale;
    });
    expect(result.current.sessions).toEqual([{id: 's1', title: 'One'}]);
  });

  it('shows loading for a foreground reload but not a background one', async () => {
    listSessions.mockResolvedValue({sessions: [], total: 0});
    const {result} = renderHook(() => useAllCodingSessions(), {wrapper});
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Background refresh: does not flip isLoading.
    let resolveBackground!: (value: unknown) => void;
    const background = new Promise((resolve) => {
      resolveBackground = resolve;
    });
    listSessions.mockReturnValueOnce(background);
    act(() => {
      void result.current.reload(true);
    });
    expect(result.current.isLoading).toBe(false);
    await act(async () => {
      resolveBackground({sessions: [], total: 0});
      await background;
    });

    // Foreground (user-initiated) reload: shows the spinner.
    let resolveForeground!: (value: unknown) => void;
    const foreground = new Promise((resolve) => {
      resolveForeground = resolve;
    });
    listSessions.mockReturnValueOnce(foreground);
    act(() => {
      void result.current.reload(false);
    });
    expect(result.current.isLoading).toBe(true);
    await act(async () => {
      resolveForeground({sessions: [], total: 0});
      await foreground;
    });
    expect(result.current.isLoading).toBe(false);
  });
});
