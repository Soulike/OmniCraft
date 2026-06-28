import {renderHook, waitFor} from '@testing-library/react';
import type {ReactNode} from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';

import type {ChatSessionApi} from '@/modules/chat-session/index.js';
import {
  ChatEventBusProvider,
  ChatSessionApiContext,
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
});
