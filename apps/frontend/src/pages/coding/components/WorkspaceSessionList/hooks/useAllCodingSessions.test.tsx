import {renderHook, waitFor} from '@testing-library/react';
import type {ReactNode} from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';

vi.mock('@/api/coding/index.js', () => ({
  listAllSessions: vi.fn(),
  deleteSession: vi.fn(),
}));

import {deleteSession, listAllSessions} from '@/api/coding/index.js';
import {ChatEventBusProvider} from '@/modules/chat-session/index.js';

import {useAllCodingSessions} from './useAllCodingSessions.js';

function wrapper({children}: {children: ReactNode}) {
  return <ChatEventBusProvider>{children}</ChatEventBusProvider>;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('useAllCodingSessions', () => {
  it('loads all sessions on mount', async () => {
    vi.mocked(listAllSessions).mockResolvedValue({
      sessions: [{id: 's1', title: 'One'}],
    });

    const {result} = renderHook(() => useAllCodingSessions(), {wrapper});

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  it('removeSession deletes then reloads', async () => {
    vi.mocked(listAllSessions).mockResolvedValue({sessions: []});
    vi.mocked(deleteSession).mockResolvedValue();

    const {result} = renderHook(() => useAllCodingSessions(), {wrapper});
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await result.current.removeSession('s1');

    expect(deleteSession).toHaveBeenCalledWith('s1');
    expect(listAllSessions).toHaveBeenCalledTimes(2);
  });
});
