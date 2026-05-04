import type {SseEvent} from '@omnicraft/sse-events';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {CodingSubAgent} from './coding-sub-agent.js';

const {queryMock} = vi.hoisted(() => ({
  queryMock: vi.fn(),
}));

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: queryMock,
}));

function snapshot() {
  const usage = {
    model: 'claude-code',
    contextWindowTokens: 0,
    currentContextInputTokens: 0,
    sessionInputTokens: 0,
    sessionOutputTokens: 0,
    sessionCacheReadInputTokens: 0,
    thinkingLevel: 'none' as const,
  };

  return {
    id: 'coding-agent-1',
    title: 'Existing Title',
    sseEventCount: 0,
    llmSession: {
      id: 'llm-session-1',
      messages: [],
      compactions: [],
      usage: {
        currentContextInputTokens: 0,
        sessionInputTokens: 0,
        sessionOutputTokens: 0,
        sessionCacheReadInputTokens: 0,
      },
    },
    options: {
      workingDirectory: '/tmp/project',
      thinkingLevel: 'none' as const,
      claudeCodeUsage: usage,
    },
  };
}

function* sdkStream(options: {
  readonly sessionId: string;
  readonly model: string;
  readonly contextInputTokens: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadInputTokens: number;
}) {
  yield {
    type: 'system',
    subtype: 'init',
    session_id: options.sessionId,
  };
  yield {
    type: 'stream_event',
    event: {
      type: 'message_start',
      message: {
        usage: {
          input_tokens:
            options.contextInputTokens - options.cacheReadInputTokens,
          output_tokens: 0,
          cache_read_input_tokens: options.cacheReadInputTokens,
          cache_creation_input_tokens: 0,
          iterations: null,
        },
      },
    },
  };
  yield {
    type: 'result',
    subtype: 'success',
    result: 'done',
    modelUsage: {
      [options.model]: {
        inputTokens: options.inputTokens,
        outputTokens: options.outputTokens,
        cacheReadInputTokens: options.cacheReadInputTokens,
        cacheCreationInputTokens: 0,
        webSearchRequests: 0,
        costUSD: 0,
        contextWindow: 128000,
        maxOutputTokens: 4096,
      },
    },
  };
}

async function collectUntilDone(
  agent: CodingSubAgent,
  startIndex = 0,
): Promise<SseEvent[]> {
  const controller = new AbortController();
  const events: SseEvent[] = [];

  for await (const entry of agent.subscribe({
    startIndex,
    signal: controller.signal,
  })) {
    const {event} = entry;
    events.push(event);
    if (event.type === 'done') {
      controller.abort();
      break;
    }
  }

  return events;
}

describe('CodingSubAgent usage reporting', () => {
  afterEach(() => {
    queryMock.mockReset();
  });

  it('requires persisted Claude Code usage when restoring', () => {
    const restoredSnapshot = {
      ...snapshot(),
      options: {
        workingDirectory: '/tmp/project',
        thinkingLevel: 'none' as const,
      },
    };

    expect(() => new CodingSubAgent('/tmp/project', restoredSnapshot)).toThrow(
      'CodingSubAgent snapshot is missing claudeCodeUsage',
    );
  });

  it('keeps current context input separate from cumulative session totals', async () => {
    queryMock
      .mockReturnValueOnce(
        sdkStream({
          sessionId: 'claude-session-1',
          model: 'claude-sonnet',
          contextInputTokens: 100,
          inputTokens: 100,
          outputTokens: 10,
          cacheReadInputTokens: 20,
        }),
      )
      .mockReturnValueOnce(
        sdkStream({
          sessionId: 'claude-session-1',
          model: 'claude-sonnet',
          contextInputTokens: 40,
          inputTokens: 40,
          outputTokens: 8,
          cacheReadInputTokens: 5,
        }),
      );
    const agent = new CodingSubAgent('/tmp/project', snapshot());

    const firstEventsPromise = collectUntilDone(agent);
    agent.handleUserMessage('first');
    await firstEventsPromise;

    const restoredAgent = new CodingSubAgent(
      '/tmp/project',
      agent.toSnapshot(),
    );

    const secondEventsPromise = collectUntilDone(restoredAgent);
    restoredAgent.handleUserMessage('second');
    const secondEvents = await secondEventsPromise;

    expect(secondEvents.at(-1)).toMatchObject({
      type: 'done',
      usage: {
        currentContextInputTokens: 40,
        sessionInputTokens: 140,
        sessionOutputTokens: 18,
        sessionCacheReadInputTokens: 25,
      },
    });
  });
});
