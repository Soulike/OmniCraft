import type {SseEvent} from '@omnicraft/sse-events';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import {MemoryRouter, Route, Routes} from 'react-router';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {ChatPage} from './ChatPage.js';

class ResizeObserverStub implements ResizeObserver {
  disconnect = vi.fn();

  observe = vi.fn();

  unobserve = vi.fn();
}

globalThis.ResizeObserver = ResizeObserverStub;

afterEach(() => {
  cleanup();
});

const mocks = vi.hoisted(() => ({
  abortCompletion: vi.fn(),
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  listSessions: vi.fn(),
  sendMessage: vi.fn(),
  submitToolResponse: vi.fn(),
  subscribeEvents: vi.fn(),
}));

vi.mock('@/api/chat/index.js', () => ({
  abortCompletion: mocks.abortCompletion,
  createSession: mocks.createSession,
  deleteSession: mocks.deleteSession,
  listSessions: mocks.listSessions,
  sendMessage: mocks.sendMessage,
  submitToolResponse: mocks.submitToolResponse,
  subscribeEvents: mocks.subscribeEvents,
}));

vi.mock('@/api/settings/file-access/index.js', () => ({
  getWorkspaces: vi.fn(() => Promise.resolve([])),
}));

async function waitForAbort(signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    signal?.addEventListener(
      'abort',
      () => {
        resolve();
      },
      {once: true},
    );
  });
}

async function* emptyEventStream(
  signal?: AbortSignal,
): AsyncGenerator<SseEvent, void, undefined> {
  yield* [] as SseEvent[];
  await waitForAbort(signal);
  return;
}

function renderChatPage(initialEntry = '/chat') {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path='/chat' element={<ChatPage />} />
        <Route path='/chat/:sessionId' element={<ChatPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ChatPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.abortCompletion.mockResolvedValue(undefined);
    mocks.createSession.mockResolvedValue('chat-session-1');
    mocks.deleteSession.mockResolvedValue(undefined);
    mocks.listSessions.mockResolvedValue({sessions: [], total: 0});
    mocks.sendMessage.mockResolvedValue(undefined);
    mocks.submitToolResponse.mockResolvedValue(undefined);
    mocks.subscribeEvents.mockImplementation(
      (_sessionId: string, _from: number, signal?: AbortSignal) =>
        emptyEventStream(signal),
    );
  });

  it('creates a chat session and sends first message', async () => {
    renderChatPage();

    const messageInput = screen.getByLabelText('Chat message');
    fireEvent.change(messageInput, {target: {value: '  Hello session.  '}});

    fireEvent.click(screen.getByRole('button', {name: 'Send message'}));

    await waitFor(() => {
      expect(mocks.createSession).toHaveBeenCalledWith({});
    });
    expect(mocks.sendMessage).toHaveBeenCalledWith(
      'chat-session-1',
      'Hello session.',
    );
  });
});
