import {describe, expect, it} from 'vitest';
import {z} from 'zod';

import {AgentType} from '../agent-type/schema.js';
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

  it('parses an http server with headers', () => {
    const parsed = mcpSettingsSchema.parse({
      servers: [
        {
          name: 'remote',
          transport: {type: 'http', url: 'https://x.example/mcp'},
        },
      ],
    });
    expect(parsed.servers[0]?.transport).toMatchObject({type: 'http'});
  });

  it('rejects a non-kebab-case server name', () => {
    const result = mcpSettingsSchema.safeParse({
      servers: [{name: 'Bad Name', transport: {type: 'stdio', command: 'x'}}],
    });
    expect(result.success).toBe(false);
  });

  it('is convertible to JSON Schema', () => {
    expect(() => z.toJSONSchema(mcpSettingsSchema)).not.toThrow();
  });
});
