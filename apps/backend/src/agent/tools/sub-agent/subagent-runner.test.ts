import type {
  SseDoneEvent,
  SseEvent,
  SseEventCursorEntry,
} from '@omnicraft/sse-events';
import {describe, expect, it} from 'vitest';

import {createMockContext} from '@/agent-core/tool/testing.js';

import {type RunnableSubagent, runSubagentTurn} from './subagent-runner.js';
import {SUB_AGENT_TYPE} from './subagent-types.js';

function fakeSubagent(events: SseEvent[]): RunnableSubagent {
  return {
    id: 'subagent-1',
    abort: () => undefined,
    handleUserMessage: () => undefined,
    subscribe: ({startIndex = 0}: {startIndex?: number} = {}) => ({
      async *[Symbol.asyncIterator](): AsyncIterator<SseEventCursorEntry> {
        for (let index = startIndex; index < events.length; index++) {
          await Promise.resolve();
          yield {event: events[index], nextIndex: index + 1};
        }
      },
    }),
  };
}

function throwingSubagent(error: Error): RunnableSubagent {
  return {
    id: 'subagent-1',
    abort: () => undefined,
    handleUserMessage: () => undefined,
    subscribe: () => ({
      [Symbol.asyncIterator](): AsyncIterator<SseEventCursorEntry> {
        return {
          async next(): Promise<IteratorResult<SseEventCursorEntry>> {
            await Promise.resolve();
            throw error;
          },
        };
      },
    }),
  };
}

function doneEvent(reason: SseDoneEvent['reason'] = 'complete'): SseDoneEvent {
  return {
    type: 'done',
    reason,
    usage: {
      model: 'm',
      contextWindowTokens: 1,
      currentContextInputTokens: 1,
      sessionInputTokens: 1,
      sessionOutputTokens: 1,
      sessionCacheReadInputTokens: 0,
      thinkingLevel: 'none',
    },
  };
}

describe('runSubagentTurn', () => {
  it('forwards only events after the provided subagent SSE start index', async () => {
    const forwarded: unknown[] = [];
    const context = createMockContext({
      onSubAgentEvent: (event) => forwarded.push(event),
    });

    const result = await runSubagentTurn({
      subagent: fakeSubagent([
        {type: 'text-delta', content: 'old'},
        {
          type: 'message-start',
          role: 'assistant',
          messageId: 'm1',
          createdAt: 1,
          content: '',
        },
        {type: 'text-delta', content: 'new'},
        doneEvent(),
      ]),
      task: 'continue',
      agentType: SUB_AGENT_TYPE.GENERAL,
      thinkingLevel: 'none',
      workingDirectory: '/tmp/work',
      context,
      subagentSseEventStartIndex: 1,
    });

    expect(result).toMatchObject({
      status: 'success',
      data: {
        subagentId: 'subagent-1',
        agentType: SUB_AGENT_TYPE.GENERAL,
        summary: 'new',
      },
    });
    expect(result.content).toBe(
      `Subagent completed.\nid: subagent-1\ntype: ${SUB_AGENT_TYPE.GENERAL}\n\nnew`,
    );
    expect(forwarded).toEqual([
      {
        type: 'subagent-dispatch',
        agentId: 'subagent-1',
        task: 'continue',
        agentType: SUB_AGENT_TYPE.GENERAL,
        thinkingLevel: 'none',
        workingDirectory: '/tmp/work',
      },
      {
        type: 'subagent-output',
        agentId: 'subagent-1',
        event: {
          type: 'message-start',
          role: 'assistant',
          messageId: 'm1',
          createdAt: 1,
          content: '',
        },
      },
      {
        type: 'subagent-output',
        agentId: 'subagent-1',
        event: {type: 'text-delta', content: 'new'},
      },
      {
        type: 'subagent-output',
        agentId: 'subagent-1',
        event: doneEvent(),
      },
      {type: 'subagent-complete', agentId: 'subagent-1', status: 'success'},
    ]);
  });

  it('does not forward non-base child events through subagent-output', async () => {
    const forwarded: unknown[] = [];
    const context = createMockContext({
      onSubAgentEvent: (event) => forwarded.push(event),
    });

    await runSubagentTurn({
      subagent: fakeSubagent([
        {type: 'session-title', title: 'Hidden title'},
        doneEvent(),
      ]),
      task: 'continue',
      agentType: SUB_AGENT_TYPE.EXPLORE,
      thinkingLevel: 'none',
      workingDirectory: '/tmp/work',
      context,
    });

    expect(forwarded).toEqual([
      {
        type: 'subagent-dispatch',
        agentId: 'subagent-1',
        task: 'continue',
        agentType: SUB_AGENT_TYPE.EXPLORE,
        thinkingLevel: 'none',
        workingDirectory: '/tmp/work',
      },
      {
        type: 'subagent-output',
        agentId: 'subagent-1',
        event: doneEvent(),
      },
      {type: 'subagent-complete', agentId: 'subagent-1', status: 'success'},
    ]);
  });

  it('treats child error events as terminal failures', async () => {
    const forwarded: unknown[] = [];
    const context = createMockContext({
      onSubAgentEvent: (event) => forwarded.push(event),
    });

    const result = await runSubagentTurn({
      subagent: fakeSubagent([
        {type: 'text-delta', content: 'partial'},
        {type: 'error', message: 'child stream failed'},
      ]),
      task: 'continue',
      agentType: SUB_AGENT_TYPE.EXPLORE,
      thinkingLevel: 'none',
      workingDirectory: '/tmp/work',
      context,
    });

    expect(result).toMatchObject({
      status: 'failure',
      data: {message: 'Subagent error: child stream failed'},
    });
    expect(result.content).toBe(
      `Subagent failed.\nid: subagent-1\ntype: ${SUB_AGENT_TYPE.EXPLORE}\n\nSubagent error: child stream failed`,
    );
    expect(forwarded).toEqual([
      {
        type: 'subagent-dispatch',
        agentId: 'subagent-1',
        task: 'continue',
        agentType: SUB_AGENT_TYPE.EXPLORE,
        thinkingLevel: 'none',
        workingDirectory: '/tmp/work',
      },
      {
        type: 'subagent-output',
        agentId: 'subagent-1',
        event: {type: 'text-delta', content: 'partial'},
      },
      {type: 'subagent-complete', agentId: 'subagent-1', status: 'failure'},
    ]);
  });

  it('returns failure when the child turn is aborted', async () => {
    const result = await runSubagentTurn({
      subagent: fakeSubagent([doneEvent('aborted')]),
      task: 'continue',
      agentType: SUB_AGENT_TYPE.GENERAL,
      thinkingLevel: 'none',
      workingDirectory: '/tmp/work',
      context: createMockContext(),
    });

    expect(result).toMatchObject({
      status: 'failure',
      data: {message: 'Subagent was aborted.'},
    });
    expect(result.content).toBe(
      `Subagent failed.\nid: subagent-1\ntype: ${SUB_AGENT_TYPE.GENERAL}\n\nSubagent was aborted.`,
    );
  });

  it('returns failure when the child turn reaches max rounds', async () => {
    const result = await runSubagentTurn({
      subagent: fakeSubagent([doneEvent('max_rounds_reached')]),
      task: 'continue',
      agentType: SUB_AGENT_TYPE.EXPLORE,
      thinkingLevel: 'none',
      workingDirectory: '/tmp/work',
      context: createMockContext(),
    });

    expect(result).toMatchObject({
      status: 'failure',
      data: {message: 'Subagent reached the maximum tool rounds.'},
    });
    expect(result.content).toBe(
      `Subagent failed.\nid: subagent-1\ntype: ${SUB_AGENT_TYPE.EXPLORE}\n\nSubagent reached the maximum tool rounds.`,
    );
  });

  it('does not start a child turn when the parent signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    const forwarded: unknown[] = [];
    let handleUserMessageCalls = 0;
    const subagent: RunnableSubagent = {
      id: 'subagent-1',
      abort: () => undefined,
      handleUserMessage: () => {
        handleUserMessageCalls++;
      },
      subscribe: () => ({
        async *[Symbol.asyncIterator](): AsyncIterator<SseEventCursorEntry> {
          await Promise.resolve();
          yield {event: doneEvent(), nextIndex: 1};
        },
      }),
    };

    const result = await runSubagentTurn({
      subagent,
      task: 'continue',
      agentType: SUB_AGENT_TYPE.GENERAL,
      thinkingLevel: 'none',
      workingDirectory: '/tmp/work',
      context: createMockContext({
        signal: controller.signal,
        onSubAgentEvent: (event) => forwarded.push(event),
      }),
    });

    expect(handleUserMessageCalls).toBe(0);
    expect(result).toMatchObject({
      status: 'failure',
      data: {message: 'Subagent was aborted before it started.'},
    });
    expect(forwarded).toEqual([
      {
        type: 'subagent-dispatch',
        agentId: 'subagent-1',
        task: 'continue',
        agentType: SUB_AGENT_TYPE.GENERAL,
        thinkingLevel: 'none',
        workingDirectory: '/tmp/work',
      },
      {type: 'subagent-complete', agentId: 'subagent-1', status: 'failure'},
    ]);
  });

  it('includes subagent identity in failure content when the turn does not complete', async () => {
    const result = await runSubagentTurn({
      subagent: fakeSubagent([]),
      task: 'continue',
      agentType: SUB_AGENT_TYPE.GENERAL,
      thinkingLevel: 'none',
      workingDirectory: '/tmp/work',
      context: createMockContext(),
    });

    expect(result).toMatchObject({status: 'failure'});
    expect(result.content).toBe(
      `Subagent failed.\nid: subagent-1\ntype: ${SUB_AGENT_TYPE.GENERAL}\n\nSubagent was aborted.`,
    );
  });

  it('includes subagent identity in error content when the child stream fails', async () => {
    const result = await runSubagentTurn({
      subagent: throwingSubagent(new Error('stream failed')),
      task: 'continue',
      agentType: SUB_AGENT_TYPE.EXPLORE,
      thinkingLevel: 'none',
      workingDirectory: '/tmp/work',
      context: createMockContext(),
    });

    expect(result).toMatchObject({status: 'failure'});
    expect(result.content).toBe(
      `Subagent failed.\nid: subagent-1\ntype: ${SUB_AGENT_TYPE.EXPLORE}\n\nSubagent error: stream failed`,
    );
  });
});
