import crypto from 'node:crypto';

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import type {LlmConfig, LlmMessage} from '../../llm-api/index.js';
import {modelCapacity} from '../../model-capacity/index.js';
import type {LlmSessionUsage} from '../types.js';
import {COMPACTION_TRIGGER_ATTACHMENT_BYTES} from './compaction-constants.js';
import {LlmCompactionDecisionService} from './llm-compaction-decision-service.js';
import {LlmCompactionTokenEstimator} from './llm-compaction-token-estimator.js';
import type {LlmCompactionDecisionInput} from './llm-compaction-types.js';

const config: LlmConfig = {
  apiFormat: 'openai-responses',
  apiKey: 'key',
  baseUrl: 'https://example.test',
  model: 'test-model',
  thinkingLevel: 'none',
  maxContextTokens: 200_000,
  maxOutputTokens: 32_000,
};

const messages: LlmMessage[] = [
  {id: 'user-1', createdAt: 1, role: 'user', content: 'hello', attachments: []},
  {
    id: 'assistant-1',
    createdAt: 2,
    role: 'assistant',
    content: 'assistant reply',
    toolCalls: [],
    thinking: [],
  },
];

const usage: LlmSessionUsage = {
  currentContextInputTokens: 0,
  latestCallOutputTokens: 0,
  sessionInputTokens: 0,
  sessionOutputTokens: 0,
  sessionCacheReadInputTokens: 0,
};

const options = {
  reason: 'before-llm-call' as const,
  tools: [],
  systemPrompt: '',
};

function createService(currentTokens: number): LlmCompactionDecisionService {
  const tokenEstimator = new LlmCompactionTokenEstimator();
  vi.spyOn(tokenEstimator, 'estimateCurrentTokens').mockReturnValue(
    currentTokens,
  );

  return new LlmCompactionDecisionService(tokenEstimator);
}

describe('LlmCompactionDecisionService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns skip below threshold', () => {
    vi.spyOn(modelCapacity, 'getMaxPromptTokens').mockReturnValue(1000);
    const service = createService(899);

    expect(
      service.decide({
        config,
        messages,
        usage,
        latestUsageInputMessageCount: null,
        options,
      }),
    ).toEqual({type: 'skip'});
  });

  it('returns skip when messages are empty even if token estimate is high', () => {
    vi.spyOn(modelCapacity, 'getMaxPromptTokens').mockReturnValue(1000);
    const service = createService(1000);

    expect(
      service.decide({
        config,
        messages: [],
        usage,
        latestUsageInputMessageCount: null,
        options,
      }),
    ).toEqual({type: 'skip'});
  });

  it('returns compact decision at or above threshold with metadata', () => {
    vi.spyOn(modelCapacity, 'getMaxPromptTokens').mockReturnValue(1000);
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(
      '00000000-0000-4000-8000-000000000000',
    );
    vi.spyOn(Date, 'now').mockReturnValue(12345);
    const service = createService(900);

    expect(
      service.decide({
        config,
        messages,
        usage,
        latestUsageInputMessageCount: null,
        options,
      }),
    ).toEqual({
      type: 'compact',
      compactionId: '00000000-0000-4000-8000-000000000000',
      reason: 'before-llm-call',
      beforeTokens: 900,
      coveredMessageCount: 2,
      startedAt: 12345,
    });
  });
});

describe('attachment byte pressure', () => {
  const bigAttachment = (fileName: string, mb: number) => ({
    fileName,
    mediaType: 'application/pdf' as const,
    lastKnownByteSize: mb * 1024 * 1024,
  });

  function inputWith(userMessages: LlmMessage[]): LlmCompactionDecisionInput {
    return {
      config,
      messages: userMessages,
      usage,
      latestUsageInputMessageCount: null,
      options,
    };
  }

  let service: LlmCompactionDecisionService;

  beforeEach(() => {
    // High enough that none of these cases come close on the token ratio —
    // only attachment byte pressure can force a decision below.
    vi.spyOn(modelCapacity, 'getMaxPromptTokens').mockReturnValue(1_000_000);
    service = createService(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('compacts when history attachment bytes reach the threshold, even far below the token ratio', () => {
    const decision = service.decide(
      inputWith([
        {
          id: 'u1',
          createdAt: 1,
          role: 'user',
          content: 'a',
          attachments: [bigAttachment('a.pdf', 9)],
        },
        {
          id: 'u2',
          createdAt: 2,
          role: 'user',
          content: 'b',
          attachments: [bigAttachment('b.pdf', 7)],
        },
      ]),
    );
    expect(decision.type).toBe('compact');
  });

  it('skips when attachment bytes are below the threshold and tokens are low', () => {
    const decision = service.decide(
      inputWith([
        {
          id: 'u1',
          createdAt: 1,
          role: 'user',
          content: 'a',
          attachments: [bigAttachment('a.pdf', 9)],
        },
      ]),
    );
    expect(decision.type).toBe('skip');
  });

  it('counts exactly at the threshold as pressure', () => {
    const decision = service.decide(
      inputWith([
        {
          id: 'u1',
          createdAt: 1,
          role: 'user',
          content: 'a',
          attachments: [bigAttachment('a.pdf', 16)],
        },
      ]),
    );
    expect(decision.type).toBe('compact');
  });

  it('skips one byte below the threshold', () => {
    const decision = service.decide(
      inputWith([
        {
          id: 'u1',
          createdAt: 1,
          role: 'user',
          content: 'a',
          attachments: [
            {
              fileName: 'a.pdf',
              mediaType: 'application/pdf',
              lastKnownByteSize: COMPACTION_TRIGGER_ATTACHMENT_BYTES - 1,
            },
          ],
        },
      ]),
    );
    expect(decision.type).toBe('skip');
  });

  it('counts zero bytes for a message with no attachments (e.g. a post-compaction synthetic message)', () => {
    const decision = service.decide(
      inputWith([
        {
          id: 's1',
          createdAt: 1,
          role: 'user',
          content: 'summary',
          attachments: [],
        },
      ]),
    );
    expect(decision.type).toBe('skip');
  });

  it('still skips an empty history regardless of byte pressure', () => {
    expect(service.decide(inputWith([])).type).toBe('skip');
  });
});
