import {describe, expect, it} from 'vitest';
import {z} from 'zod';

import {AgentType} from '../agent-type/schema.js';
import {mcpServerSchema} from '../index.js';
import {mcpSettingsSchema} from './schema.js';

describe('mcpSettingsSchema', () => {
  it('defaults to no servers and empty per-agent enablement', () => {
    const parsed = mcpSettingsSchema.parse({});
    expect(parsed.servers).toEqual([]);
    expect(parsed.enabledByAgent[AgentType.CHAT]).toEqual([]);
    expect(parsed.enabledByAgent[AgentType.CODING]).toEqual([]);
  });

  it('parses a stdio server', () => {
    const parsed = mcpSettingsSchema.parse({
      servers: [
        {name: 'fs', transport: {type: 'stdio', command: 'npx', args: ['x']}},
      ],
      enabledByAgent: {chat: ['fs']},
    });
    expect(parsed.servers[0]?.transport).toMatchObject({
      type: 'stdio',
      command: 'npx',
    });
    expect(parsed.enabledByAgent[AgentType.CHAT]).toEqual(['fs']);
  });

  it('rejects a non-kebab-case server name', () => {
    const result = mcpSettingsSchema.safeParse({
      servers: [{name: 'Bad Name', transport: {type: 'stdio', command: 'x'}}],
    });
    expect(result.success).toBe(false);
  });

  it('rejects duplicate server names', () => {
    const result = mcpSettingsSchema.safeParse({
      servers: [
        {name: 'fs', transport: {type: 'stdio', command: 'x'}},
        {name: 'fs', transport: {type: 'stdio', command: 'y'}},
      ],
    });
    expect(result.success).toBe(false);
  });

  it('accepts distinct server names', () => {
    const result = mcpSettingsSchema.safeParse({
      servers: [
        {name: 'fs', transport: {type: 'stdio', command: 'x'}},
        {name: 'remote', transport: {type: 'http', url: 'https://x.example'}},
      ],
    });
    expect(result.success).toBe(true);
  });

  it('is convertible to JSON Schema', () => {
    expect(() => z.toJSONSchema(mcpSettingsSchema)).not.toThrow();
  });
});

describe('mcpServerSchema (package export)', () => {
  it('parses a stdio server', () => {
    const result = mcpServerSchema.safeParse({
      name: 'fs',
      transport: {type: 'stdio', command: 'npx'},
    });
    expect(result.success).toBe(true);
  });

  it('parses an http server', () => {
    const result = mcpServerSchema.safeParse({
      name: 'remote',
      transport: {type: 'http', url: 'https://mcp.example.com/mcp'},
    });
    expect(result.success).toBe(true);
  });

  it('rejects a non-kebab-case name', () => {
    const result = mcpServerSchema.safeParse({
      name: 'Bad Name',
      transport: {type: 'stdio', command: 'x'},
    });
    expect(result.success).toBe(false);
  });
});
