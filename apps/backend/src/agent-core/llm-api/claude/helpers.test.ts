import {describe, expect, it} from 'vitest';

import type {McpToolDefinition} from '../../tool/index.js';
import {
  addCacheBreakpoint,
  toClaudeTool,
  toClaudeToolResultContent,
  toOutputConfig,
  toSdkMessage,
  toThinkingConfig,
} from './helpers.js';

const mcpTool: McpToolDefinition = {
  kind: 'mcp',
  name: 'mcp__fs__read',
  displayName: 'fs: read',
  description: 'read a file',
  suppressToolEvents: false,
  inputJsonSchema: {
    type: 'object',
    properties: {path: {type: 'string'}},
    required: ['path'],
  },
  execute: () => ({
    content: [{type: 'text', text: 'ok'}],
    status: 'success',
    data: {},
  }),
};

describe('toClaudeTool with an mcp tool', () => {
  it('uses inputJsonSchema verbatim', () => {
    const tool = toClaudeTool(mcpTool);
    expect(tool.name).toBe('mcp__fs__read');
    expect(tool.input_schema).toEqual(mcpTool.inputJsonSchema);
  });
});

describe('addCacheBreakpoint', () => {
  it('converts string content to array with cache_control', () => {
    const result = addCacheBreakpoint({role: 'user', content: 'hello'});

    expect(result).toEqual({
      role: 'user',
      content: [
        {type: 'text', text: 'hello', cache_control: {type: 'ephemeral'}},
      ],
    });
  });

  it('adds cache_control to the last block of array content', () => {
    const result = addCacheBreakpoint({
      role: 'assistant',
      content: [
        {type: 'text', text: 'thinking...'},
        {type: 'tool_use', id: 'call_1', name: 'get_time', input: {}},
      ],
    });

    expect(result).toEqual({
      role: 'assistant',
      content: [
        {type: 'text', text: 'thinking...'},
        {
          type: 'tool_use',
          id: 'call_1',
          name: 'get_time',
          input: {},
          cache_control: {type: 'ephemeral'},
        },
      ],
    });
  });

  it('adds cache_control to tool_result content', () => {
    const result = addCacheBreakpoint({
      role: 'user',
      content: [{type: 'tool_result', tool_use_id: 'call_1', content: 'done'}],
    });

    expect(result).toEqual({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'call_1',
          content: 'done',
          cache_control: {type: 'ephemeral'},
        },
      ],
    });
  });

  it('does not mutate the original message', () => {
    const original = {
      role: 'user' as const,
      content: [{type: 'text' as const, text: 'hello'}],
    };
    const originalBlock = original.content[0];

    addCacheBreakpoint(original);

    expect(original.content[0]).toBe(originalBlock);
    expect('cache_control' in original.content[0]).toBe(false);
  });

  it('returns message unchanged for empty array content', () => {
    const message = {role: 'user' as const, content: [] as never[]};
    const result = addCacheBreakpoint(message);

    expect(result).toEqual(message);
  });
});

describe('toThinkingConfig', () => {
  it('disables thinking only for none', () => {
    expect(toThinkingConfig('none')).toEqual({type: 'disabled'});
    for (const level of [
      'minimal',
      'low',
      'medium',
      'high',
      'xhigh',
      'max',
    ] as const) {
      expect(toThinkingConfig(level)).toEqual({type: 'adaptive'});
    }
  });
});

describe('toOutputConfig', () => {
  it('returns undefined for none', () => {
    expect(toOutputConfig('none')).toBeUndefined();
  });

  it('clamps minimal to low', () => {
    expect(toOutputConfig('minimal')).toEqual({effort: 'low'});
  });

  it('maps shared levels 1:1 and preserves xhigh and max', () => {
    expect(toOutputConfig('low')).toEqual({effort: 'low'});
    expect(toOutputConfig('medium')).toEqual({effort: 'medium'});
    expect(toOutputConfig('high')).toEqual({effort: 'high'});
    expect(toOutputConfig('xhigh')).toEqual({effort: 'xhigh'});
    expect(toOutputConfig('max')).toEqual({effort: 'max'});
  });
});

describe('toClaudeToolResultContent', () => {
  it('maps text/image/document blocks to Anthropic content', () => {
    const content = toClaudeToolResultContent([
      {type: 'text', text: 'hello'},
      {type: 'image', mediaType: 'image/png', data: 'AAAA'},
      {
        type: 'document',
        mediaType: 'application/pdf',
        data: 'BBBB',
        name: 'r.pdf',
      },
    ]);
    expect(content).toEqual([
      {type: 'text', text: 'hello'},
      {
        type: 'image',
        source: {type: 'base64', media_type: 'image/png', data: 'AAAA'},
      },
      {
        type: 'document',
        source: {type: 'base64', media_type: 'application/pdf', data: 'BBBB'},
        title: 'r.pdf',
      },
    ]);
  });
});

describe('toSdkMessage user attachments', () => {
  const base = {id: 'u1', createdAt: 1, role: 'user' as const, content: 'look'};

  it('keeps bare string content when there are no attachments', () => {
    expect(toSdkMessage({...base, attachments: []})).toEqual({
      role: 'user',
      content: 'look',
    });
  });

  it('emits media before the text block', () => {
    const result = toSdkMessage({
      ...base,
      attachments: [
        {
          fileName: 'shot.png',
          mediaType: 'image/png',
          lastKnownByteSize: 3,
          data: 'AAA=',
          materializedByteSize: Buffer.from('AAA=', 'base64').byteLength,
        },
      ],
    });

    expect(result).toEqual({
      role: 'user',
      content: [
        {
          type: 'image',
          source: {type: 'base64', media_type: 'image/png', data: 'AAA='},
        },
        {type: 'text', text: 'look'},
      ],
    });
  });

  it('emits a document block with a title for a PDF', () => {
    const result = toSdkMessage({
      ...base,
      attachments: [
        {
          fileName: 'invoice.pdf',
          mediaType: 'application/pdf',
          lastKnownByteSize: 3,
          data: 'BBB=',
          materializedByteSize: Buffer.from('BBB=', 'base64').byteLength,
        },
      ],
    });

    expect(result.content).toEqual([
      {
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: 'BBB=',
        },
        title: 'invoice.pdf',
      },
      {type: 'text', text: 'look'},
    ]);
  });

  it('puts the cache breakpoint on the text block, not the media block', () => {
    const message = toSdkMessage({
      ...base,
      attachments: [
        {
          fileName: 'shot.png',
          mediaType: 'image/png',
          lastKnownByteSize: 3,
          data: 'AAA=',
          materializedByteSize: Buffer.from('AAA=', 'base64').byteLength,
        },
      ],
    });
    const marked = addCacheBreakpoint(message);

    expect(Array.isArray(marked.content)).toBe(true);
    if (!Array.isArray(marked.content)) return;
    expect(marked.content[0]).not.toHaveProperty('cache_control');
    expect(marked.content[1]).toMatchObject({
      type: 'text',
      cache_control: {type: 'ephemeral'},
    });
  });
});
