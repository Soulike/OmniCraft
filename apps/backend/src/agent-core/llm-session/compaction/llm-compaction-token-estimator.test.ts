import {describe, expect, it} from 'vitest';
import {z} from 'zod';

import type {LlmMessage} from '../../llm-api/index.js';
import {estimatePromptTokens} from '../../llm-api/token-estimator.js';
import type {ToolDefinition} from '../../tool/types.js';
import {LlmCompactionTokenEstimator} from './llm-compaction-token-estimator.js';

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
  {id: 'user-2', createdAt: 3, role: 'user', content: 'pending follow up'},
];

const tools: ToolDefinition[] = [
  {
    name: 'read_file',
    displayName: 'Read File',
    description: 'Read a file',
    parameters: z.object({path: z.string()}),
    suppressToolEvents: false,
    execute: () => ({data: {}, content: 'ok', status: 'success'}),
  },
];

describe('LlmCompactionTokenEstimator', () => {
  it('uses latest provider usage plus latest output tokens plus pending message estimate when latest usage input message count is valid', () => {
    const estimator = new LlmCompactionTokenEstimator();

    const currentTokens = estimator.estimateCurrentTokens({
      messages,
      usage: {
        currentContextInputTokens: 100,
        latestCallOutputTokens: 12,
        sessionInputTokens: 100,
        sessionOutputTokens: 12,
        sessionCacheReadInputTokens: 0,
      },
      latestUsageInputMessageCount: 1,
      options: {
        reason: 'before-llm-call',
        tools: [],
        systemPrompt: '',
        thinkingLevel: 'none',
      },
    });

    expect(currentTokens).toBe(112 + estimatePromptTokens(messages.slice(2)));
  });

  it('falls back to local prompt estimation when latest usage is unavailable', () => {
    const estimator = new LlmCompactionTokenEstimator();

    const currentTokens = estimator.estimateCurrentTokens({
      messages,
      usage: {
        currentContextInputTokens: 0,
        latestCallOutputTokens: 12,
        sessionInputTokens: 100,
        sessionOutputTokens: 12,
        sessionCacheReadInputTokens: 0,
      },
      latestUsageInputMessageCount: null,
      options: {
        reason: 'before-llm-call',
        tools,
        systemPrompt: 'System prompt',
        thinkingLevel: 'medium',
      },
    });

    expect(currentTokens).toBe(
      estimatePromptTokens({
        messages,
        systemPrompt: 'System prompt',
        tools: tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          parameters: z.toJSONSchema(tool.parameters),
        })),
        thinkingLevel: 'medium',
      }),
    );
  });

  it('estimates an arbitrary replacement message array with system prompt, tools, and thinking level', () => {
    const estimator = new LlmCompactionTokenEstimator();
    const replacementMessages = [
      {id: 'summary', createdAt: 4, role: 'user' as const, content: 'summary'},
    ];

    const currentTokens = estimator.estimateTokensFromMessages({
      messages: replacementMessages,
      options: {
        reason: 'after-turn',
        tools,
        systemPrompt: 'Replacement system prompt',
        thinkingLevel: 'high',
      },
    });

    expect(currentTokens).toBe(
      estimatePromptTokens({
        messages: replacementMessages,
        systemPrompt: 'Replacement system prompt',
        tools: tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          parameters: z.toJSONSchema(tool.parameters),
        })),
        thinkingLevel: 'high',
      }),
    );
  });
});
