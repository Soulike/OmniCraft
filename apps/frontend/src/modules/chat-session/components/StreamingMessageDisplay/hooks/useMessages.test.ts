import {describe, expect, it} from 'vitest';

import type {ChatMessage} from '../types.js';
import {
  applyCompactionEnd,
  applyCompactionError,
  pushCompactionStart,
} from './useMessages.js';

const startEvent = {
  type: 'context-compaction-start' as const,
  compactionId: 'cid-1',
  reason: 'after-turn' as const,
  beforeTokens: 1000,
  messageCount: 5,
};

describe('compaction reducers', () => {
  it('pushCompactionStart appends an in-progress card and an empty placeholder', () => {
    const result = pushCompactionStart([], startEvent);
    expect(result).toHaveLength(2);
    expect(result[0].content).toMatchObject({
      type: 'context-compaction',
      status: 'in-progress',
      compactionId: 'cid-1',
    });
    expect(result[1].content).toEqual({type: 'text', content: ''});
  });

  it('applyCompactionEnd replaces the matching card with the done variant', () => {
    const initial = pushCompactionStart([], startEvent);
    const next = applyCompactionEnd(initial, {
      type: 'context-compaction-end',
      compactionId: 'cid-1',
      summary: 'a summary',
      beforeTokens: 1000,
      afterTokens: 200,
      messageCount: 5,
      durationMs: 50,
    });
    expect(next[0].content).toEqual({
      type: 'context-compaction',
      status: 'done',
      compactionId: 'cid-1',
      reason: 'after-turn',
      beforeTokens: 1000,
      messageCount: 5,
      summary: 'a summary',
      afterTokens: 200,
      durationMs: 50,
    });
  });

  it('applyCompactionError replaces the matching card with the failed variant', () => {
    const initial = pushCompactionStart([], startEvent);
    const next = applyCompactionError(initial, {
      type: 'context-compaction-error',
      compactionId: 'cid-1',
      reason: 'after-turn',
      message: 'Aborted',
      beforeTokens: 1000,
      messageCount: 5,
    });
    expect(next[0].content).toEqual({
      type: 'context-compaction',
      status: 'failed',
      compactionId: 'cid-1',
      reason: 'after-turn',
      beforeTokens: 1000,
      messageCount: 5,
      errorMessage: 'Aborted',
    });
  });

  it('end with no matching compactionId is a no-op', () => {
    const initial: ChatMessage[] = [
      {
        id: null,
        createdAt: null,
        role: 'assistant',
        content: {type: 'text', content: 'hi'},
      },
    ];
    const next = applyCompactionEnd(initial, {
      type: 'context-compaction-end',
      compactionId: 'no-such-id',
      summary: 's',
      beforeTokens: 0,
      afterTokens: 0,
      messageCount: 0,
      durationMs: 0,
    });
    expect(next).toEqual(initial);
  });

  it('error with no matching compactionId is a no-op', () => {
    const initial: ChatMessage[] = [
      {
        id: null,
        createdAt: null,
        role: 'assistant',
        content: {type: 'text', content: 'hi'},
      },
    ];
    const next = applyCompactionError(initial, {
      type: 'context-compaction-error',
      compactionId: 'no-such-id',
      reason: 'after-turn',
      message: 'oops',
      beforeTokens: 0,
      messageCount: 0,
    });
    expect(next).toEqual(initial);
  });
});
