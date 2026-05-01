import {describe, expect, it} from 'vitest';
import {z} from 'zod';

import type {LlmMessage} from '../../llm-api/index.js';
import type {ToolDefinition} from '../../tool/types.js';
import {buildRecentContext, slimMessagesForSummary} from './slim.js';

const toolCall = {callId: 'call-1', toolName: 'custom_tool', arguments: '{}'};

const customTool: ToolDefinition<z.ZodObject<Record<string, never>>> = {
  name: 'custom_tool',
  displayName: 'Custom Tool',
  description: 'Custom tool',
  parameters: z.object({}),
  suppressToolEvents: false,
  compactResult: () => 'compact custom result',
  execute: () => ({status: 'success', content: 'ok', data: {}}),
};

describe('slimMessagesForSummary', () => {
  it('keeps short user content unchanged', () => {
    const result = slimMessagesForSummary(
      [{id: 'user', createdAt: 1, role: 'user', content: 'short'}],
      [],
    );

    expect(result.join('\n')).toContain('short');
  });

  it('adds an omitted marker for large user content', () => {
    const result = slimMessagesForSummary(
      [
        {
          id: 'user',
          createdAt: 1,
          role: 'user',
          content: 'a'.repeat(9000),
        },
      ],
      [],
    ).join('\n');

    expect(result).toContain('truncated for compaction only');
    expect(result.length).toBeLessThan(9000);
  });

  it('drops assistant thinking blocks', () => {
    const messages: LlmMessage[] = [
      {
        id: 'assistant',
        createdAt: 1,
        role: 'assistant',
        content: 'text',
        toolCalls: [],
        thinking: [{content: ['private'], signature: 'sig'}],
      },
    ];

    const result = slimMessagesForSummary(messages, []);

    expect(result[0]).not.toContain('private');
    expect(result[0]).toContain('assistant');
    expect(result[0]).toContain('text');
  });

  it('truncates assistant content and tool call arguments', () => {
    const messages: LlmMessage[] = [
      {
        id: 'assistant',
        createdAt: 1,
        role: 'assistant',
        content: 'a'.repeat(9000),
        thinking: [],
        toolCalls: [
          {
            callId: 'call-1',
            toolName: 'custom_tool',
            arguments: 'b'.repeat(9000),
          },
        ],
      },
    ];

    const result = slimMessagesForSummary(messages, []);
    const assistant = JSON.parse(result[0] ?? '{}') as {
      content: string;
      toolCalls: {arguments: string}[];
    };

    expect(assistant.content).toContain('truncated for compaction only');
    expect(assistant.content.length).toBeLessThan(9000);
    expect(assistant.toolCalls[0]?.arguments).toContain(
      'truncated for compaction only',
    );
    expect(assistant.toolCalls[0]?.arguments.length).toBeLessThan(9000);
  });

  it('uses tool compactResult when available', () => {
    const messages: LlmMessage[] = [
      {
        id: 'assistant',
        createdAt: 1,
        role: 'assistant',
        content: '',
        thinking: [],
        toolCalls: [toolCall],
      },
      {
        id: 'tool',
        createdAt: 1,
        role: 'tool',
        callId: 'call-1',
        content: 'raw result',
        status: 'success',
      },
    ];

    const result = slimMessagesForSummary(messages, [customTool]);

    expect(result.join('\n')).toContain('compact custom result');
    expect(result.join('\n')).not.toContain('raw result');
  });

  it('truncates tool compactResult output', () => {
    const longCompactTool: ToolDefinition<z.ZodObject<Record<string, never>>> =
      {
        ...customTool,
        compactResult: () => 'c'.repeat(9000),
      };
    const messages: LlmMessage[] = [
      {
        id: 'assistant',
        createdAt: 1,
        role: 'assistant',
        content: '',
        thinking: [],
        toolCalls: [toolCall],
      },
      {
        id: 'tool',
        createdAt: 1,
        role: 'tool',
        callId: 'call-1',
        content: 'raw result',
        status: 'success',
      },
    ];

    const result = slimMessagesForSummary(messages, [longCompactTool]);
    const toolResult = JSON.parse(result[1] ?? '{}') as {content: string};

    expect(toolResult.content).toContain('truncated for compaction only');
    expect(toolResult.content.length).toBeLessThan(9000);
    expect(toolResult.content).not.toContain('raw result');
  });

  it('builds recent context from the latest 20 slimmed messages', () => {
    const messages: LlmMessage[] = Array.from({length: 25}, (_, index) => ({
      id: `message-${index.toString()}`,
      createdAt: index,
      role: 'user' as const,
      content: `message ${index.toString()}`,
    }));

    const result = buildRecentContext(messages, []);

    expect(result.sourceMessageCount).toBe(20);
    expect(result.content).toContain('message 5');
    expect(result.content).toContain('message 24');
    expect(result.content).not.toContain('message 4');
  });

  it('reports zero source messages for empty recent context', () => {
    const result = buildRecentContext([], []);

    expect(result).toEqual({
      content: 'No recent context.',
      sourceMessageCount: 0,
    });
  });
});
