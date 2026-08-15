import assert from 'node:assert';

import {describe, expect, it} from 'vitest';

import {
  assertWithinMaterializationBudget,
  MAX_MATERIALIZED_ATTACHMENT_BYTES,
} from './attachment-limits.js';
import type {LlmRequestMessage} from './types.js';

function userMessageOf(
  materializedByteSizes: readonly number[],
): LlmRequestMessage {
  return {
    id: 'm1',
    createdAt: 0,
    role: 'user',
    content: 'look',
    attachments: materializedByteSizes.map((materializedByteSize, index) => ({
      fileName: `a${index.toString()}.png`,
      mediaType: 'image/png' as const,
      // Deliberately unrelated to the measured size: a record is exactly what
      // this budget must not consult.
      lastKnownByteSize: 1,
      data: 'AAA=',
      materializedByteSize,
    })),
  };
}

describe('assertWithinMaterializationBudget', () => {
  it('accepts a request exactly at the budget', () => {
    expect(() => {
      assertWithinMaterializationBudget([
        userMessageOf([MAX_MATERIALIZED_ATTACHMENT_BYTES]),
      ]);
    }).not.toThrow();
  });

  it('throws when the total is one byte over, across several messages', () => {
    const half = MAX_MATERIALIZED_ATTACHMENT_BYTES / 2;
    expect(() => {
      assertWithinMaterializationBudget([
        userMessageOf([half]),
        userMessageOf([half + 1]),
      ]);
    }).toThrow(/materialization budget/);
  });

  // The placeholder path: an attachment `llm-session` refused to read carries
  // no bytes, so it must not be charged. Otherwise degrading a turn could
  // itself trip the assert that degrading exists to avoid.
  it('charges nothing for an attachment that was not delivered', () => {
    const message: LlmRequestMessage = {
      id: 'm1',
      createdAt: 0,
      role: 'user',
      content: 'look',
      attachments: [
        {
          fileName: 'huge.png',
          mediaType: 'image/png',
          lastKnownByteSize: MAX_MATERIALIZED_ATTACHMENT_BYTES * 10,
          data: null,
          reason: 'too-large',
        },
      ],
    };

    expect(() => {
      assertWithinMaterializationBudget([message]);
    }).not.toThrow();
  });

  // The producers this exists for: `compaction-summary-generator` and
  // `agent-title` both assemble their own request messages and would still
  // compile if they started attaching something.
  it('ignores messages that cannot carry attachments', () => {
    const assistant: LlmRequestMessage = {
      id: 'm2',
      createdAt: 0,
      role: 'assistant',
      content: 'sure',
      toolCalls: [],
      thinking: [],
    };

    expect(() => {
      assertWithinMaterializationBudget([assistant]);
    }).not.toThrow();
  });

  it('accepts an empty request', () => {
    expect(() => {
      assertWithinMaterializationBudget([]);
    }).not.toThrow();
  });

  it('reports both the total and the limit', () => {
    try {
      assertWithinMaterializationBudget([
        userMessageOf([MAX_MATERIALIZED_ATTACHMENT_BYTES + 5]),
      ]);
      expect.unreachable('should have thrown');
    } catch (error: unknown) {
      assert(error instanceof Error);
      expect(error.message).toContain(
        (MAX_MATERIALIZED_ATTACHMENT_BYTES + 5).toString(),
      );
      expect(error.message).toContain(
        MAX_MATERIALIZED_ATTACHMENT_BYTES.toString(),
      );
    }
  });
});
