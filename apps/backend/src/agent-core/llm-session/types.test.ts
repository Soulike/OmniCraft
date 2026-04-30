import {describe, expect, it} from 'vitest';

import {llmSessionSnapshotSchema} from './types.js';

describe('llmSessionSnapshotSchema', () => {
  it('requires compactions metadata', () => {
    const result = llmSessionSnapshotSchema.safeParse({
      id: 'session-1',
      messages: [],
    });

    expect(result.success).toBe(false);
  });

  it('accepts an empty compactions array', () => {
    const result = llmSessionSnapshotSchema.safeParse({
      id: 'session-1',
      messages: [],
      compactions: [],
    });

    expect(result.success).toBe(true);
  });

  it('requires status on tool result messages', () => {
    const result = llmSessionSnapshotSchema.safeParse({
      id: 'session-1',
      compactions: [],
      messages: [
        {
          id: 'tool-message',
          createdAt: 1,
          role: 'tool',
          callId: 'call-1',
          content: 'done',
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it('accepts status on tool result messages', () => {
    const result = llmSessionSnapshotSchema.safeParse({
      id: 'session-1',
      compactions: [],
      messages: [
        {
          id: 'tool-message',
          createdAt: 1,
          role: 'tool',
          callId: 'call-1',
          content: 'done',
          status: 'success',
        },
      ],
    });

    expect(result.success).toBe(true);
  });
});
