import {describe, expect, it} from 'vitest';

import {
  addCacheBreakpoint,
  toOutputConfig,
  toThinkingConfig,
} from './helpers.js';

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
