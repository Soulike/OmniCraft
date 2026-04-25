import type {ThinkingLevel} from '@omnicraft/api-schema';
import type {SseEvent} from '@omnicraft/sse-events';
import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import {MemoryRouter, Route, Routes} from 'react-router';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {CodingPage} from './CodingPage.js';

class ResizeObserverStub implements ResizeObserver {
  disconnect = vi.fn();

  observe = vi.fn();

  unobserve = vi.fn();
}

globalThis.ResizeObserver = ResizeObserverStub;

const mocks = vi.hoisted(() => ({
  abortCompletion: vi.fn(),
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  getVscodeStatus: vi.fn(),
  getVscodeUrl: vi.fn(),
  getWorkspaces: vi.fn(),
  listSessions: vi.fn(),
  sendMessage: vi.fn(),
  submitToolResponse: vi.fn(),
  subscribeEvents: vi.fn(),
}));

vi.mock('@/api/coding/index.js', () => ({
  abortCompletion: mocks.abortCompletion,
  createSession: mocks.createSession,
  deleteSession: mocks.deleteSession,
  listSessions: mocks.listSessions,
  sendMessage: mocks.sendMessage,
  submitToolResponse: mocks.submitToolResponse,
  subscribeEvents: mocks.subscribeEvents,
}));

vi.mock('@/api/settings/file-access/index.js', () => ({
  getWorkspaces: mocks.getWorkspaces,
}));

vi.mock('@/api/vscode/index.js', () => ({
  getVscodeStatus: mocks.getVscodeStatus,
  getVscodeUrl: mocks.getVscodeUrl,
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

function renderCodingPage() {
  render(
    <MemoryRouter initialEntries={['/coding']}>
      <Routes>
        <Route path='/coding' element={<CodingPage />} />
        <Route path='/coding/:sessionId' element={<CodingPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('CodingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.abortCompletion.mockResolvedValue(undefined);
    mocks.createSession.mockResolvedValue('coding-session-1');
    mocks.deleteSession.mockResolvedValue(undefined);
    mocks.getVscodeStatus.mockResolvedValue({
      available: false,
      port: 0,
      connectionToken: '',
    });
    mocks.getVscodeUrl.mockReturnValue('http://localhost:18927');
    mocks.getWorkspaces.mockResolvedValue([{path: '/workspace/repo'}]);
    mocks.listSessions.mockResolvedValue({sessions: [], total: 0});
    mocks.sendMessage.mockResolvedValue(undefined);
    mocks.submitToolResponse.mockResolvedValue(undefined);
    mocks.subscribeEvents.mockImplementation(
      (_sessionId: string, _from: number, signal?: AbortSignal) =>
        emptyEventStream(signal),
    );
  });

  it('starts a coding session from the dispatch card and switches to chat input', async () => {
    renderCodingPage();

    expect(screen.queryByLabelText('Chat message')).not.toBeInTheDocument();

    const taskInput = await screen.findByLabelText('Task');
    fireEvent.change(taskInput, {
      target: {value: '  Implement the requested task.  '},
    });

    const startButton = screen.getByRole('button', {name: 'Start task'});
    await waitFor(() => {
      expect(startButton).toBeEnabled();
    });

    fireEvent.click(startButton);

    await waitFor(() => {
      expect(mocks.createSession).toHaveBeenCalledWith({
        workspace: '/workspace/repo',
      });
    });
    expect(mocks.sendMessage).toHaveBeenCalledWith(
      'coding-session-1',
      'Implement the requested task.',
      'none' satisfies ThinkingLevel,
    );

    expect(await screen.findByLabelText('Chat message')).toBeInTheDocument();
    expect(screen.queryByLabelText('Task')).not.toBeInTheDocument();
  });
});
