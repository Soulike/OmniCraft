import {describe, expect, it} from 'vitest';

import type {ChatMessage} from '../../../types.js';
import {transformMessages} from './useMessageList.js';

describe('transformMessages', () => {
  it('converts a user text message to UserTextRenderItem', () => {
    const messages: ChatMessage[] = [
      {
        id: null,
        createdAt: null,
        role: 'user',
        content: {type: 'text', content: 'Hello'},
      },
    ];
    const result = transformMessages(messages);
    expect(result).toEqual([
      {type: 'user-text', id: null, content: 'Hello', createdAt: null},
    ]);
  });

  it('converts an assistant text message to AssistantTextRenderItem', () => {
    const messages: ChatMessage[] = [
      {
        id: null,
        createdAt: null,
        role: 'assistant',
        content: {type: 'text', content: 'Hi there'},
      },
    ];
    const result = transformMessages(messages);
    expect(result).toEqual([
      {type: 'assistant-text', id: null, content: 'Hi there', createdAt: null},
    ]);
  });

  it('pairs tool-execute-start and tool-execute-end by callId across messages', () => {
    const messages: ChatMessage[] = [
      {
        id: null,
        createdAt: null,
        role: 'assistant',
        content: {
          type: 'tool-execute-start',
          callId: 'c1',
          toolName: 'search',
          displayName: 'Search',
          arguments: '{"q":"test"}',
        },
      },
      {
        id: null,
        createdAt: null,
        role: 'assistant',
        content: {
          type: 'tool-execute-end',
          callId: 'c1',
          result: 'found it',
          status: 'success',
        },
      },
    ];
    const result = transformMessages(messages);
    expect(result).toEqual([
      {
        type: 'tool-execution',
        callId: 'c1',
        toolName: 'search',
        displayName: 'Search',
        arguments: '{"q":"test"}',
        status: 'done',
        result: 'found it',
      },
    ]);
  });

  it('marks tool as running when end event is missing', () => {
    const messages: ChatMessage[] = [
      {
        id: null,
        createdAt: null,
        role: 'assistant',
        content: {
          type: 'tool-execute-start',
          callId: 'c1',
          toolName: 'search',
          displayName: 'Search',
          arguments: '{}',
        },
      },
    ];
    const result = transformMessages(messages);
    expect(result).toEqual([
      {
        type: 'tool-execution',
        callId: 'c1',
        toolName: 'search',
        displayName: 'Search',
        arguments: '{}',
        status: 'running',
      },
    ]);
  });

  it('marks tool as failure when status is failure', () => {
    const messages: ChatMessage[] = [
      {
        id: null,
        createdAt: null,
        role: 'assistant',
        content: {
          type: 'tool-execute-start',
          callId: 'c1',
          toolName: 'run_command',
          displayName: 'Run Command',
          arguments: '{"command":"exit 1"}',
        },
      },
      {
        id: null,
        createdAt: null,
        role: 'assistant',
        content: {
          type: 'tool-execute-end',
          callId: 'c1',
          result: 'Exit code: 1',
          status: 'failure',
        },
      },
    ];
    const result = transformMessages(messages);
    expect(result).toEqual([
      {
        type: 'tool-execution',
        callId: 'c1',
        toolName: 'run_command',
        displayName: 'Run Command',
        arguments: '{"command":"exit 1"}',
        status: 'failure',
        result: 'Exit code: 1',
      },
    ]);
  });

  it('marks tool as error when status is error', () => {
    const messages: ChatMessage[] = [
      {
        id: null,
        createdAt: null,
        role: 'assistant',
        content: {
          type: 'tool-execute-start',
          callId: 'c1',
          toolName: 'search',
          displayName: 'Search',
          arguments: '{}',
        },
      },
      {
        id: null,
        createdAt: null,
        role: 'assistant',
        content: {
          type: 'tool-execute-end',
          callId: 'c1',
          result: 'Error: failed',
          status: 'error',
        },
      },
    ];
    const result = transformMessages(messages);
    expect(result).toEqual([
      {
        type: 'tool-execution',
        callId: 'c1',
        toolName: 'search',
        displayName: 'Search',
        arguments: '{}',
        status: 'error',
        result: 'Error: failed',
      },
    ]);
  });

  it('handles mixed text and tool messages in order', () => {
    const messages: ChatMessage[] = [
      {
        id: null,
        createdAt: null,
        role: 'assistant',
        content: {type: 'text', content: 'Let me search'},
      },
      {
        id: null,
        createdAt: null,
        role: 'assistant',
        content: {
          type: 'tool-execute-start',
          callId: 'c1',
          toolName: 'search',
          displayName: 'Search',
          arguments: '{}',
        },
      },
      {
        id: null,
        createdAt: null,
        role: 'assistant',
        content: {
          type: 'tool-execute-end',
          callId: 'c1',
          result: 'result',
          status: 'success',
        },
      },
      {
        id: null,
        createdAt: null,
        role: 'assistant',
        content: {type: 'text', content: 'Here is what I found'},
      },
    ];
    const result = transformMessages(messages);
    expect(result).toHaveLength(3);
    expect(result[0].type).toBe('assistant-text');
    expect(result[1].type).toBe('tool-execution');
    expect(result[2].type).toBe('assistant-text');
  });

  it('skips tool-execute-end messages in the output', () => {
    const messages: ChatMessage[] = [
      {
        id: null,
        createdAt: null,
        role: 'assistant',
        content: {
          type: 'tool-execute-end',
          callId: 'c1',
          result: 'orphan result',
          status: 'success',
        },
      },
    ];
    const result = transformMessages(messages);
    expect(result).toEqual([]);
  });

  it('returns empty array for empty messages', () => {
    const result = transformMessages([]);
    expect(result).toEqual([]);
  });

  it('converts a streaming thinking message to ThinkingRenderItem', () => {
    const messages: ChatMessage[] = [
      {
        id: null,
        createdAt: null,
        role: 'assistant',
        content: {type: 'thinking', content: 'considering...', done: false},
      },
    ];
    const result = transformMessages(messages);
    expect(result).toEqual([
      {type: 'thinking', content: 'considering...', done: false},
    ]);
  });

  it('converts a completed thinking message to ThinkingRenderItem', () => {
    const messages: ChatMessage[] = [
      {
        id: null,
        createdAt: null,
        role: 'assistant',
        content: {type: 'thinking', content: 'I thought about it.', done: true},
      },
    ];
    const result = transformMessages(messages);
    expect(result).toEqual([
      {type: 'thinking', content: 'I thought about it.', done: true},
    ]);
  });

  it('filters out empty completed thinking messages', () => {
    const messages: ChatMessage[] = [
      {
        id: null,
        createdAt: null,
        role: 'assistant',
        content: {type: 'thinking', content: '', done: true},
      },
    ];
    const result = transformMessages(messages);
    expect(result).toEqual([]);
  });

  it('filters out whitespace-only completed thinking messages', () => {
    const messages: ChatMessage[] = [
      {
        id: null,
        createdAt: null,
        role: 'assistant',
        content: {type: 'thinking', content: '   \n  ', done: true},
      },
    ];
    const result = transformMessages(messages);
    expect(result).toEqual([]);
  });

  it('handles thinking followed by text in order', () => {
    const messages: ChatMessage[] = [
      {
        id: null,
        createdAt: null,
        role: 'assistant',
        content: {type: 'thinking', content: 'Let me think...', done: true},
      },
      {
        id: null,
        createdAt: null,
        role: 'assistant',
        content: {type: 'text', content: 'Here is the answer'},
      },
    ];
    const result = transformMessages(messages);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      type: 'thinking',
      content: 'Let me think...',
      done: true,
    });
    expect(result[1].type).toBe('assistant-text');
  });

  it('handles thinking interleaved with tool execution', () => {
    const messages: ChatMessage[] = [
      {
        id: null,
        createdAt: null,
        role: 'assistant',
        content: {type: 'thinking', content: 'I need to search', done: true},
      },
      {
        id: null,
        createdAt: null,
        role: 'assistant',
        content: {
          type: 'tool-execute-start',
          callId: 'c1',
          toolName: 'search',
          displayName: 'Search',
          arguments: '{}',
        },
      },
      {
        id: null,
        createdAt: null,
        role: 'assistant',
        content: {
          type: 'tool-execute-end',
          callId: 'c1',
          result: 'found',
          status: 'success',
        },
      },
      {
        id: null,
        createdAt: null,
        role: 'assistant',
        content: {
          type: 'thinking',
          content: 'Now I can answer',
          done: true,
        },
      },
      {
        id: null,
        createdAt: null,
        role: 'assistant',
        content: {type: 'text', content: 'The answer is...'},
      },
    ];
    const result = transformMessages(messages);
    expect(result).toHaveLength(4);
    expect(result[0].type).toBe('thinking');
    expect(result[1].type).toBe('tool-execution');
    expect(result[2].type).toBe('thinking');
    expect(result[3].type).toBe('assistant-text');
  });
});
