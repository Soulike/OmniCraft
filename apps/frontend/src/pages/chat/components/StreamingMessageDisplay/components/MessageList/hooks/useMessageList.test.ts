import {describe, expect, it} from 'vitest';

import type {ChatEventBus, ChatMessage} from '../../../types.js';
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
          toolName: 'search_files',
          displayName: 'Search Files',
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
          data: {pattern: 'test', basePath: '.', matches: [], truncated: false},
        },
      },
    ];
    const result = transformMessages(messages);
    expect(result).toEqual([
      {
        type: 'tool-execution',
        callId: 'c1',
        toolName: 'search_files',
        displayName: 'Search Files',
        arguments: '{"q":"test"}',
        status: 'done',
        result: 'found it',
        data: {pattern: 'test', basePath: '.', matches: [], truncated: false},
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
          toolName: 'search_files',
          displayName: 'Search Files',
          arguments: '{}',
        },
      },
    ];
    const result = transformMessages(messages);
    expect(result).toEqual([
      {
        type: 'tool-execution',
        callId: 'c1',
        toolName: 'search_files',
        displayName: 'Search Files',
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
          data: {message: 'Exit code: 1'},
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
        data: {message: 'Exit code: 1'},
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
          toolName: 'search_files',
          displayName: 'Search Files',
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
          data: {message: 'failed'},
        },
      },
    ];
    const result = transformMessages(messages);
    expect(result).toEqual([
      {
        type: 'tool-execution',
        callId: 'c1',
        toolName: 'search_files',
        displayName: 'Search Files',
        arguments: '{}',
        status: 'error',
        result: 'Error: failed',
        data: {message: 'failed'},
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
          toolName: 'search_files',
          displayName: 'Search Files',
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
          data: {pattern: '', basePath: '.', matches: [], truncated: false},
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
          data: {pattern: '', basePath: '.', matches: [], truncated: false},
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

  it('pairs ask_user tool start and end events', () => {
    const messages: ChatMessage[] = [
      {
        id: null,
        createdAt: null,
        role: 'assistant',
        content: {
          type: 'tool-execute-start',
          callId: 'c1',
          toolName: 'ask_user',
          displayName: 'Ask User',
          arguments:
            '{"questions":[{"question":"City?","options":["NYC","SF"]}]}',
        },
      },
      {
        id: null,
        createdAt: null,
        role: 'assistant',
        content: {
          type: 'tool-execute-end',
          callId: 'c1',
          result: 'Q: City?\nA: SF',
          status: 'success',
          data: {
            answers: [{question: 'City?', answer: 'SF'}],
          },
        },
      },
    ];
    const result = transformMessages(messages);
    expect(result).toEqual([
      {
        type: 'tool-execution',
        callId: 'c1',
        toolName: 'ask_user',
        displayName: 'Ask User',
        arguments:
          '{"questions":[{"question":"City?","options":["NYC","SF"]}]}',
        status: 'done',
        result: 'Q: City?\nA: SF',
        data: {answers: [{question: 'City?', answer: 'SF'}]},
      },
    ]);
  });

  it('marks ask_user as running when no end event exists', () => {
    const messages: ChatMessage[] = [
      {
        id: null,
        createdAt: null,
        role: 'assistant',
        content: {
          type: 'tool-execute-start',
          callId: 'c1',
          toolName: 'ask_user',
          displayName: 'Ask User',
          arguments: '{"questions":[{"question":"Name?","options":[]}]}',
        },
      },
    ];
    const result = transformMessages(messages);
    expect(result).toEqual([
      {
        type: 'tool-execution',
        callId: 'c1',
        toolName: 'ask_user',
        displayName: 'Ask User',
        arguments: '{"questions":[{"question":"Name?","options":[]}]}',
        status: 'running',
      },
    ]);
  });

  it('marks ask_user as failure when user cancels', () => {
    const messages: ChatMessage[] = [
      {
        id: null,
        createdAt: null,
        role: 'assistant',
        content: {
          type: 'tool-execute-start',
          callId: 'c1',
          toolName: 'ask_user',
          displayName: 'Ask User',
          arguments: '{"questions":[{"question":"City?","options":["A"]}]}',
        },
      },
      {
        id: null,
        createdAt: null,
        role: 'assistant',
        content: {
          type: 'tool-execute-end',
          callId: 'c1',
          result: 'User declined to answer.',
          status: 'failure',
          data: {message: 'User declined to answer.'},
        },
      },
    ];
    const result = transformMessages(messages);
    expect(result).toEqual([
      {
        type: 'tool-execution',
        callId: 'c1',
        toolName: 'ask_user',
        displayName: 'Ask User',
        arguments: '{"questions":[{"question":"City?","options":["A"]}]}',
        status: 'failure',
        result: 'User declined to answer.',
        data: {message: 'User declined to answer.'},
      },
    ]);
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
          toolName: 'search_files',
          displayName: 'Search Files',
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
          data: {pattern: '', basePath: '.', matches: [], truncated: false},
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

  it('converts a running subagent message to SubagentRenderItem', () => {
    const mockBus = {} as ChatEventBus;
    const messages: ChatMessage[] = [
      {
        id: null,
        createdAt: null,
        role: 'assistant',
        content: {
          type: 'subagent',
          agentId: 'agent-1',
          task: 'Search config files',
          status: 'running',
          eventBus: mockBus,
        },
      },
    ];
    const result = transformMessages(messages);
    expect(result).toEqual([
      {
        type: 'subagent',
        agentId: 'agent-1',
        task: 'Search config files',
        status: 'running',
        eventBus: mockBus,
      },
    ]);
  });

  it('converts a completed subagent message to SubagentRenderItem', () => {
    const mockBus = {} as ChatEventBus;
    const messages: ChatMessage[] = [
      {
        id: null,
        createdAt: null,
        role: 'assistant',
        content: {
          type: 'subagent',
          agentId: 'agent-1',
          task: 'Search config files',
          status: 'complete',
          eventBus: mockBus,
        },
      },
    ];
    const result = transformMessages(messages);
    expect(result).toEqual([
      {
        type: 'subagent',
        agentId: 'agent-1',
        task: 'Search config files',
        status: 'complete',
        eventBus: mockBus,
      },
    ]);
  });
});
