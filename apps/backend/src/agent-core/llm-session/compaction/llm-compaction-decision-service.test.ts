import crypto from 'node:crypto';

import {afterEach, describe, expect, it, vi} from 'vitest';

import type {LlmConfig, LlmMessage} from '../../llm-api/index.js';
import {modelCapacity} from '../../model-capacity/index.js';
import type {LlmSessionUsage} from '../types.js';
import {LlmCompactionDecisionService} from './llm-compaction-decision-service.js';
import {LlmCompactionTokenEstimator} from './llm-compaction-token-estimator.js';

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
  {id: 'user-1', createdAt: 1, role: 'user', content: 'hello'},
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
