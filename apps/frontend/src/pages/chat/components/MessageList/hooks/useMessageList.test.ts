import {describe, expect, it} from 'vitest';

import type {ChatMessage} from '../../../types.js';
import {transformMessages} from './useMessageList.js';

describe('transformMessages', () => {
  it('converts a user text message to UserTextRenderItem', () => {
    const messages: ChatMessage[] = [
      {role: 'user', content: {type: 'text', content: 'Hello'}},
    ];
    const result = transformMessages(messages);
    expect(result).toEqual([{type: 'user-text', content: 'Hello'}]);
  });

  it('converts an assistant text message to AssistantTextRenderItem', () => {
    const messages: ChatMessage[] = [
      {role: 'assistant', content: {type: 'text', content: 'Hi there'}},
    ];
    const result = transformMessages(messages);
    expect(result).toEqual([{type: 'assistant-text', content: 'Hi there'}]);
  });

  it('pairs tool-execution-start and tool-execution-end by callId across messages', () => {
    const messages: ChatMessage[] = [
      {
        role: 'assistant',
        content: {
          type: 'tool-execution-start',
          callId: 'c1',
          toolName: 'search',
          arguments: '{"q":"test"}',
        },
      },
      {
        role: 'assistant',
        content: {
          type: 'tool-execution-end',
          callId: 'c1',
          result: 'found it',
          isError: false,
        },
      },
    ];
    const result = transformMessages(messages);
    expect(result).toEqual([
      {
        type: 'tool-execution',
        callId: 'c1',
        toolName: 'search',
        arguments: '{"q":"test"}',
        status: 'done',
        result: 'found it',
      },
    ]);
  });

  it('marks tool as running when end event is missing', () => {
    const messages: ChatMessage[] = [
      {
        role: 'assistant',
        content: {
          type: 'tool-execution-start',
          callId: 'c1',
          toolName: 'search',
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
        arguments: '{}',
        status: 'running',
      },
    ]);
  });

  it('marks tool as error when isError is true', () => {
    const messages: ChatMessage[] = [
      {
        role: 'assistant',
        content: {
          type: 'tool-execution-start',
          callId: 'c1',
          toolName: 'search',
          arguments: '{}',
        },
      },
      {
        role: 'assistant',
        content: {
          type: 'tool-execution-end',
          callId: 'c1',
          result: 'Error: failed',
          isError: true,
        },
      },
    ];
    const result = transformMessages(messages);
    expect(result).toEqual([
      {
        type: 'tool-execution',
        callId: 'c1',
        toolName: 'search',
        arguments: '{}',
        status: 'error',
        result: 'Error: failed',
      },
    ]);
  });

  it('handles mixed text and tool messages in order', () => {
    const messages: ChatMessage[] = [
      {role: 'assistant', content: {type: 'text', content: 'Let me search'}},
      {
        role: 'assistant',
        content: {
          type: 'tool-execution-start',
          callId: 'c1',
          toolName: 'search',
          arguments: '{}',
        },
      },
      {
        role: 'assistant',
        content: {
          type: 'tool-execution-end',
          callId: 'c1',
          result: 'result',
          isError: false,
        },
      },
      {
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

  it('skips tool-execution-end messages in the output', () => {
    const messages: ChatMessage[] = [
      {
        role: 'assistant',
        content: {
          type: 'tool-execution-end',
          callId: 'c1',
          result: 'orphan result',
          isError: false,
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
});
