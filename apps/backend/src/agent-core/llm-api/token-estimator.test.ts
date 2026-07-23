import {describe, expect, it} from 'vitest';

import {estimatePromptTokens} from './token-estimator.js';
import type {LlmMessage} from './types.js';

function userMessage(content: string): LlmMessage {
  return {id: 'u', createdAt: 0, role: 'user', content};
}

function imageResult(data: string): LlmMessage {
  return {
    id: 't',
    createdAt: 0,
    role: 'tool',
    callId: 'c',
    status: 'success',
    content: [{type: 'image', mediaType: 'image/png', data}],
  };
}

function documentResult(data: string): LlmMessage {
  return {
    id: 't',
    createdAt: 0,
    role: 'tool',
    callId: 'c',
    status: 'success',
    content: [
      {type: 'document', mediaType: 'application/pdf', data, name: 'r.pdf'},
    ],
  };
}

describe('estimatePromptTokens', () => {
  it('grows with text message size', () => {
    const small = estimatePromptTokens({messages: [userMessage('hello')]});
    const large = estimatePromptTokens({
      messages: [userMessage('hello'.repeat(200))],
    });

    expect(large).toBeGreaterThan(small);
  });

  it('counts an image by a bounded cost, independent of base64 size', () => {
    const small = estimatePromptTokens({messages: [imageResult('AAAA')]});
    const huge = estimatePromptTokens({
      messages: [imageResult('A'.repeat(400_000))],
    });

    // The fix: base64 length must not drive the estimate.
    expect(huge).toBe(small);
    // Sanity: nowhere near the ~130k tokens a base64-length count would produce.
    expect(huge).toBeLessThan(5_000);
  });

  it('counts a document by a bounded cost, independent of base64 size', () => {
    const small = estimatePromptTokens({messages: [documentResult('AAAA')]});
    const huge = estimatePromptTokens({
      messages: [documentResult('A'.repeat(400_000))],
    });

    expect(huge).toBe(small);
    expect(huge).toBeLessThan(10_000);
  });

  it('adds text alongside media within a tool result', () => {
    const imageOnly = estimatePromptTokens({messages: [imageResult('AAAA')]});
    const imageWithText = estimatePromptTokens({
      messages: [
        {
          id: 't',
          createdAt: 0,
          role: 'tool',
          callId: 'c',
          status: 'success',
          content: [
            {type: 'text', text: 'see the chart:'},
            {type: 'image', mediaType: 'image/png', data: 'AAAA'},
          ],
        },
      ],
    });

    expect(imageWithText).toBeGreaterThan(imageOnly);
  });

  it('counts assistant tool calls and thinking', () => {
    const plain = estimatePromptTokens({
      messages: [
        {
          id: 'a',
          createdAt: 0,
          role: 'assistant',
          content: 'reply',
          toolCalls: [],
          thinking: [],
        },
      ],
    });
    const withExtras = estimatePromptTokens({
      messages: [
        {
          id: 'a',
          createdAt: 0,
          role: 'assistant',
          content: 'reply',
          toolCalls: [
            {callId: 'c', toolName: 'read_file', arguments: '{"path":"/x"}'},
          ],
          thinking: [{content: ['let me think about this'], signature: 'sig'}],
        },
      ],
    });

    expect(withExtras).toBeGreaterThan(plain);
  });

  it('counts the system prompt', () => {
    const withoutSystem = estimatePromptTokens({messages: [userMessage('hi')]});
    const withSystem = estimatePromptTokens({
      messages: [userMessage('hi')],
      systemPrompt: 'You are a helpful assistant.',
    });

    expect(withSystem).toBeGreaterThan(withoutSystem);
  });
});
