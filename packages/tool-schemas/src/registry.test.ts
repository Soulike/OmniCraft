import {describe, expect, it} from 'vitest';

import {toolResultDataSchema} from './registry.js';

describe('toolResultDataSchema', () => {
  it('accepts an MCP tool result', () => {
    const parsed = toolResultDataSchema.parse({
      server: 'fs',
      toolName: 'read',
      text: 'file contents',
    });
    expect(parsed).toMatchObject({server: 'fs', toolName: 'read'});
  });
});
