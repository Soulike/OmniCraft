import {describe, expect, it} from 'vitest';

import type {ChatEventBus, ChatMessage} from '../types.js';
import {pushCompactionEvent, updateSubagentStatus} from './useMessages.js';

const startEvent = {
  type: 'context-compaction-start' as const,
  compactionId: 'cid-1',
  reason: 'after-turn' as const,
  beforeTokens: 1000,
  messageCount: 5,
};
const endEvent = {
  type: 'context-compaction-end' as const,
  compactionId: 'cid-1',
  summary: 'a summary',
  beforeTokens: 1000,
  afterTokens: 200,
  messageCount: 5,
  durationMs: 50,
};
const errorEvent = {
  type: 'context-compaction-error' as const,
  compactionId: 'cid-1',
  reason: 'after-turn' as const,
  message: 'Aborted',
  beforeTokens: 1000,
  messageCount: 5,
};

describe('pushCompactionEvent', () => {
  it('appends a start event as the only new message', () => {
    const result = pushCompactionEvent([], startEvent);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe(startEvent);
  });

  it('appends an end event as the only new message', () => {
    const result = pushCompactionEvent([], endEvent);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe(endEvent);
  });

  it('appends an error event as the only new message', () => {
    const result = pushCompactionEvent([], errorEvent);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe(errorEvent);
  });

  it('strips a trailing empty assistant placeholder before appending', () => {
    const result = pushCompactionEvent(
      [
        {
          id: null,
          createdAt: null,
          role: 'assistant',
          content: {type: 'text', content: ''},
        },
      ],
      startEvent,
    );
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe(startEvent);
  });
});

describe('updateSubagentStatus', () => {
  it('updates only the latest running subagent item with the matching agent id', () => {
    const eventBus = {} as ChatEventBus;
    const messages: ChatMessage[] = [
      {
        id: null,
        createdAt: null,
        role: 'assistant',
        content: {
          type: 'subagent',
          mode: 'dispatch',
          agentId: 'agent-1',
          task: 'Initial task',
          agentType: 'general',
          thinkingLevel: 'none',
          workingDirectory: '/tmp',
          status: 'complete',
          eventBus,
        },
      },
      {
        id: null,
        createdAt: null,
        role: 'assistant',
        content: {
          type: 'subagent',
          mode: 'resume',
          agentId: 'agent-1',
          task: 'Follow-up task',
          agentType: 'general',
          thinkingLevel: 'none',
          workingDirectory: '/tmp',
          status: 'running',
          eventBus,
        },
      },
    ];

    const result = updateSubagentStatus(messages, {
      agentId: 'agent-1',
      status: 'failure',
    });

    expect(result[0].content).toMatchObject({
      type: 'subagent',
      mode: 'dispatch',
      status: 'complete',
    });
    expect(result[1].content).toMatchObject({
      type: 'subagent',
      mode: 'resume',
      status: 'error',
    });
  });
});
