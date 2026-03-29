import {describe, expect, it} from 'vitest';

import type {ChatMessage} from '../../../types.js';
import {transformMessages} from './useMessageList.js';

describe('transformMessages', () => {
  it('converts a user message to UserMessageRenderItem', () => {
    const messages = [
      {role: 'user', content: [{type: 'text', content: 'Hello'}]},
    ] satisfies ChatMessage[];
    const result = transformMessages(messages, false);
    expect(result).toEqual([{type: 'user', text: 'Hello'}]);
  });

  it('converts a pure text assistant message', () => {
    const messages = [
      {role: 'assistant', content: [{type: 'text', content: 'Hi there'}]},
    ] satisfies ChatMessage[];
    const result = transformMessages(messages, false);
    expect(result).toEqual([
      {
        type: 'assistant',
        segments: [{type: 'text', content: 'Hi there', isStreaming: false}],
      },
    ]);
  });

  it('pairs tool-execution-start and tool-execution-end by callId', () => {
    const messages = [
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-execution-start',
            callId: 'c1',
            toolName: 'search',
            arguments: '{"q":"test"}',
          },
          {
            type: 'tool-execution-end',
            callId: 'c1',
            result: 'found it',
            isError: false,
          },
        ],
      },
    ] satisfies ChatMessage[];
    const result = transformMessages(messages, false);
    expect(result).toEqual([
      {
        type: 'assistant',
        segments: [
          {
            type: 'tool-execution',
            callId: 'c1',
            toolName: 'search',
            arguments: '{"q":"test"}',
            status: 'done',
            result: 'found it',
          },
        ],
      },
    ]);
  });

  it('marks tool as running when end event is missing', () => {
    const messages = [
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-execution-start',
            callId: 'c1',
            toolName: 'search',
            arguments: '{}',
          },
        ],
      },
    ] satisfies ChatMessage[];
    const result = transformMessages(messages, true);
    expect(result[0].type).toBe('assistant');
    if (result[0].type === 'assistant') {
      expect(result[0].segments[0]).toMatchObject({
        type: 'tool-execution',
        status: 'running',
      });
    }
  });

  it('marks tool as error when isError is true', () => {
    const messages = [
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-execution-start',
            callId: 'c1',
            toolName: 'search',
            arguments: '{}',
          },
          {
            type: 'tool-execution-end',
            callId: 'c1',
            result: 'Error: failed',
            isError: true,
          },
        ],
      },
    ] satisfies ChatMessage[];
    const result = transformMessages(messages, false);
    if (result[0].type === 'assistant') {
      expect(result[0].segments[0]).toMatchObject({
        type: 'tool-execution',
        status: 'error',
        result: 'Error: failed',
      });
    }
  });

  it('sets isStreaming only on last text segment of last assistant message when streaming', () => {
    const messages = [
      {
        role: 'assistant',
        content: [{type: 'text', content: 'old message'}],
      },
      {
        role: 'assistant',
        content: [{type: 'text', content: 'streaming...'}],
      },
    ] satisfies ChatMessage[];

    const streaming = transformMessages(messages, true);
    // First assistant message: not streaming
    if (streaming[0].type === 'assistant') {
      expect(streaming[0].segments[0]).toMatchObject({isStreaming: false});
    }
    // Last assistant message: streaming
    if (streaming[1].type === 'assistant') {
      expect(streaming[1].segments[0]).toMatchObject({isStreaming: true});
    }

    // When not streaming, neither should be marked
    const notStreaming = transformMessages(messages, false);
    if (notStreaming[1].type === 'assistant') {
      expect(notStreaming[1].segments[0]).toMatchObject({isStreaming: false});
    }
  });

  it('handles mixed text and tool content in order', () => {
    const messages = [
      {
        role: 'assistant',
        content: [
          {type: 'text', content: 'Let me search'},
          {
            type: 'tool-execution-start',
            callId: 'c1',
            toolName: 'search',
            arguments: '{}',
          },
          {
            type: 'tool-execution-end',
            callId: 'c1',
            result: 'result',
            isError: false,
          },
          {type: 'text', content: 'Here is what I found'},
        ],
      },
    ] satisfies ChatMessage[];
    const result = transformMessages(messages, false);
    if (result[0].type === 'assistant') {
      expect(result[0].segments).toHaveLength(3);
      expect(result[0].segments[0].type).toBe('text');
      expect(result[0].segments[1].type).toBe('tool-execution');
      expect(result[0].segments[2].type).toBe('text');
    }
  });
});
