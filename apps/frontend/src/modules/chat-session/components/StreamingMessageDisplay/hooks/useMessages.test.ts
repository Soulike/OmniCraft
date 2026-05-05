import {describe, expect, it} from 'vitest';

import {
  pushCompactionEnd,
  pushCompactionError,
  pushCompactionStart,
} from './useMessages.js';

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

describe('compaction pushers', () => {
  it('pushCompactionStart appends the event and a trailing text placeholder', () => {
    const result = pushCompactionStart([], startEvent);
    expect(result).toHaveLength(2);
    expect(result[0].content).toBe(startEvent);
    expect(result[1].content).toEqual({type: 'text', content: ''});
  });

  it('pushCompactionEnd appends the event and a trailing text placeholder', () => {
    const result = pushCompactionEnd([], endEvent);
    expect(result).toHaveLength(2);
    expect(result[0].content).toBe(endEvent);
    expect(result[1].content).toEqual({type: 'text', content: ''});
  });

  it('pushCompactionError appends the event and a trailing text placeholder', () => {
    const result = pushCompactionError([], errorEvent);
    expect(result).toHaveLength(2);
    expect(result[0].content).toBe(errorEvent);
    expect(result[1].content).toEqual({type: 'text', content: ''});
  });
});
