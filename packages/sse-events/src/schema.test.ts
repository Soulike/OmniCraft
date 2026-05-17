import {describe, expect, it} from 'vitest';

import {
  sseBaseEventSchema,
  sseContextCompactionEndEventSchema,
  sseContextCompactionErrorEventSchema,
  sseContextCompactionStartEventSchema,
  sseEventSchema,
  sseSubagentCompleteEventSchema,
  sseSubagentDispatchEventSchema,
  sseSubagentOutputEventSchema,
  sseSubagentResumeEventSchema,
} from './schema.js';

describe('context-compaction-start schema', () => {
  it('parses a valid event', () => {
    const event = {
      type: 'context-compaction-start',
      compactionId: 'abc',
      reason: 'before-llm-call',
      beforeTokens: 1000,
      messageCount: 12,
    };
    expect(sseContextCompactionStartEventSchema.parse(event)).toEqual(event);
    expect(sseBaseEventSchema.parse(event)).toEqual(event);
    expect(sseEventSchema.parse(event)).toEqual(event);
  });

  it('rejects missing compactionId', () => {
    expect(() =>
      sseContextCompactionStartEventSchema.parse({
        type: 'context-compaction-start',
        reason: 'before-llm-call',
        beforeTokens: 1000,
        messageCount: 12,
      }),
    ).toThrow();
  });

  it('rejects an unknown reason', () => {
    expect(() =>
      sseContextCompactionStartEventSchema.parse({
        type: 'context-compaction-start',
        compactionId: 'abc',
        reason: 'unknown',
        beforeTokens: 1000,
        messageCount: 12,
      }),
    ).toThrow();
  });
});

describe('context-compaction-end schema', () => {
  it('parses a valid event', () => {
    const event = {
      type: 'context-compaction-end',
      compactionId: 'abc',
      summary: 'A short summary.',
      beforeTokens: 1000,
      afterTokens: 200,
      messageCount: 12,
      durationMs: 4321,
    };
    expect(sseContextCompactionEndEventSchema.parse(event)).toEqual(event);
    expect(sseBaseEventSchema.parse(event)).toEqual(event);
    expect(sseEventSchema.parse(event)).toEqual(event);
  });
});

describe('context-compaction-error schema', () => {
  it('parses a valid event', () => {
    const event = {
      type: 'context-compaction-error',
      compactionId: 'abc',
      reason: 'after-turn',
      message: 'Aborted',
      beforeTokens: 1000,
      messageCount: 12,
    };
    expect(sseContextCompactionErrorEventSchema.parse(event)).toEqual(event);
    expect(sseBaseEventSchema.parse(event)).toEqual(event);
    expect(sseEventSchema.parse(event)).toEqual(event);
  });
});

describe('base event schema', () => {
  const agentId = '11111111-1111-4111-8111-111111111111';

  it('accepts non-recursive agent events as subagent output payloads', () => {
    const events = [
      {type: 'session-title', title: 'Multiplication'},
      {type: 'todo-update', items: []},
      {type: 'error', message: 'Subagent failed'},
    ];

    for (const event of events) {
      expect(sseBaseEventSchema.parse(event)).toEqual(event);
      expect(sseEventSchema.parse(event)).toEqual(event);
      expect(
        sseSubagentOutputEventSchema.parse({
          type: 'subagent-output',
          agentId,
          event,
        }),
      ).toEqual({type: 'subagent-output', agentId, event});
    }
  });

  it('rejects recursive subagent events as subagent output payloads', () => {
    const recursiveEvents = [
      {
        type: 'subagent-dispatch',
        agentId,
        task: 'Inspect the project',
        agentType: 'general',
        thinkingLevel: 'none',
        workingDirectory: '/workspace/project',
      },
      {
        type: 'subagent-resume',
        agentId,
        task: 'Inspect the next question',
        agentType: 'general',
        thinkingLevel: 'none',
        workingDirectory: '/workspace/project',
      },
      {
        type: 'subagent-output',
        agentId,
        event: {type: 'text-delta', content: 'nested'},
      },
      {type: 'subagent-complete', agentId, status: 'success'},
    ];

    for (const event of recursiveEvents) {
      expect(() => sseBaseEventSchema.parse(event)).toThrow();
      expect(() =>
        sseSubagentOutputEventSchema.parse({
          type: 'subagent-output',
          agentId,
          event,
        }),
      ).toThrow();
    }
  });
});

describe('subagent-dispatch schema', () => {
  it('rejects a non-UUID agent id', () => {
    expect(() =>
      sseSubagentDispatchEventSchema.parse({
        type: 'subagent-dispatch',
        agentId: 'not-a-uuid',
        task: 'Inspect the project',
        agentType: 'general',
        thinkingLevel: 'none',
        workingDirectory: '/workspace/project',
      }),
    ).toThrow();
  });

  it('rejects an unknown subagent type', () => {
    expect(() =>
      sseSubagentDispatchEventSchema.parse({
        type: 'subagent-dispatch',
        agentId: '11111111-1111-4111-8111-111111111111',
        task: 'Inspect the project',
        agentType: 'unknown',
        thinkingLevel: 'none',
        workingDirectory: '/workspace/project',
      }),
    ).toThrow();
  });
});

describe('subagent-resume schema', () => {
  it('parses a valid resume event', () => {
    const event = {
      type: 'subagent-resume',
      agentId: '11111111-1111-4111-8111-111111111111',
      task: 'Continue with the next file',
      agentType: 'general',
      thinkingLevel: 'none',
      workingDirectory: '/workspace/project',
    };

    expect(sseSubagentResumeEventSchema.parse(event)).toEqual(event);
    expect(sseEventSchema.parse(event)).toEqual(event);
    expect(() => sseBaseEventSchema.parse(event)).toThrow();
  });

  it('rejects a non-UUID agent id', () => {
    expect(() =>
      sseSubagentResumeEventSchema.parse({
        type: 'subagent-resume',
        agentId: 'not-a-uuid',
        task: 'Continue with the next file',
        agentType: 'general',
        thinkingLevel: 'none',
        workingDirectory: '/workspace/project',
      }),
    ).toThrow();
  });

  it('rejects an unknown subagent type', () => {
    expect(() =>
      sseSubagentResumeEventSchema.parse({
        type: 'subagent-resume',
        agentId: '11111111-1111-4111-8111-111111111111',
        task: 'Continue with the next file',
        agentType: 'unknown',
        thinkingLevel: 'none',
        workingDirectory: '/workspace/project',
      }),
    ).toThrow();
  });
});

describe('subagent-output schema', () => {
  it('rejects a non-UUID agent id', () => {
    expect(() =>
      sseSubagentOutputEventSchema.parse({
        type: 'subagent-output',
        agentId: 'not-a-uuid',
        event: {type: 'text-delta', content: 'Hello'},
      }),
    ).toThrow();
  });
});

describe('subagent-complete schema', () => {
  it('rejects a non-UUID agent id', () => {
    expect(() =>
      sseSubagentCompleteEventSchema.parse({
        type: 'subagent-complete',
        agentId: 'not-a-uuid',
        status: 'success',
      }),
    ).toThrow();
  });
});
