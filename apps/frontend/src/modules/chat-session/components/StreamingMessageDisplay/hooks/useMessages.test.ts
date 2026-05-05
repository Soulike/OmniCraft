import {describe, expect, it} from 'vitest';

import {pushCompactionEvent} from './useMessages.js';

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
