import {describe, expect, it} from 'vitest';

import type {LlmMessage} from '../../llm-api/index.js';
import {splitCompactablePrefix} from './history-split.js';

function user(id: string): LlmMessage {
  return {id, createdAt: 1, role: 'user', content: id};
}

function assistantTool(id: string, callId: string): LlmMessage {
  return {
    id,
    createdAt: 1,
    role: 'assistant',
    content: '',
    thinking: [],
    toolCalls: [{callId, toolName: 'read_file', arguments: '{}'}],
  };
}

function tool(id: string, callId: string): LlmMessage {
  return {
    id,
    createdAt: 1,
    role: 'tool',
    callId,
    content: 'result',
    status: 'success',
  };
}

describe('splitCompactablePrefix', () => {
  it('keeps the last N messages', () => {
    const messages = Array.from({length: 12}, (_, index) => user(`m${index}`));
    const result = splitCompactablePrefix(messages, {minRawMessages: 8});

    expect(result.compactablePrefix).toHaveLength(4);
    expect(result.rawSuffix.map((m) => m.id)).toEqual([
      'm4',
      'm5',
      'm6',
      'm7',
      'm8',
      'm9',
      'm10',
      'm11',
    ]);
  });

  it('keeps an unclosed tool call and everything after it', () => {
    const messages = [
      user('old-1'),
      user('old-2'),
      assistantTool('assistant-tool', 'call-1'),
      user('later'),
    ];

    const result = splitCompactablePrefix(messages, {minRawMessages: 1});

    expect(result.compactablePrefix.map((m) => m.id)).toEqual([
      'old-1',
      'old-2',
    ]);
    expect(result.rawSuffix.map((m) => m.id)).toEqual([
      'assistant-tool',
      'later',
    ]);
  });

  it('keeps the most recent closed tool group', () => {
    const messages = [
      user('old'),
      assistantTool('assistant-tool', 'call-1'),
      tool('tool-result', 'call-1'),
      user('final'),
    ];

    const result = splitCompactablePrefix(messages, {minRawMessages: 1});

    expect(result.compactablePrefix.map((m) => m.id)).toEqual(['old']);
    expect(result.rawSuffix.map((m) => m.id)).toEqual([
      'assistant-tool',
      'tool-result',
      'final',
    ]);
  });
});
