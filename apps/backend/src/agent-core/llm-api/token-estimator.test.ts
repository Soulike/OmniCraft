import {describe, expect, it} from 'vitest';

import {estimatePromptTokens} from './token-estimator.js';
import type {LlmMessage} from './types.js';

function userMessage(content: string): LlmMessage {
  return {id: 'u', createdAt: 0, role: 'user', content, attachments: []};
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

describe('user message attachments', () => {
  it('charges a bounded per-image cost on top of the text', () => {
    const withoutImage = estimatePromptTokens({
      messages: [
        {id: 'u', createdAt: 0, role: 'user', content: 'hi', attachments: []},
      ],
    });
    const withImage = estimatePromptTokens({
      messages: [
        {
          id: 'u',
          createdAt: 0,
          role: 'user',
          content: 'hi',
          attachments: [
            {
              fileName: 'a.png',
              mediaType: 'image/png',
              lastKnownByteSize: 4_000_000,
            },
          ],
        },
      ],
    });

    // Bounded and independent of lastKnownByteSize — matches the tool-result image cost.
    expect(withImage - withoutImage).toBe(1600);
  });

  it('charges a larger bounded cost for a PDF', () => {
    const base = estimatePromptTokens({
      messages: [
        {id: 'u', createdAt: 0, role: 'user', content: 'hi', attachments: []},
      ],
    });
    const withPdf = estimatePromptTokens({
      messages: [
        {
          id: 'u',
          createdAt: 0,
          role: 'user',
          content: 'hi',
          attachments: [
            {
              fileName: 'a.pdf',
              mediaType: 'application/pdf',
              lastKnownByteSize: 10,
            },
          ],
        },
      ],
    });

    expect(withPdf - base).toBe(3000);
  });

  it('accepts a resolved request message without counting the base64', () => {
    const estimate = estimatePromptTokens({
      messages: [
        {
          id: 'u',
          createdAt: 0,
          role: 'user',
          content: 'hi',
          attachments: [
            {
              fileName: 'a.png',
              mediaType: 'image/png',
              lastKnownByteSize: 3,
              data: 'A'.repeat(100_000),
              materializedByteSize: 3,
            },
          ],
        },
      ],
    });

    // 'hi' is 1 token; the image is the flat 1600. The base64 must not be
    // counted as text — that would over-count by ~30,000 tokens.
    expect(estimate).toBeLessThan(1700);
  });
});
