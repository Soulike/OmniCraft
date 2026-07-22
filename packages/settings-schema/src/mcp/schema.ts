import {z} from 'zod';

import {AgentType} from '../agent-type/schema.js';

const mcpTransportSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('stdio'),
    command: z.string().describe('Executable to spawn'),
    args: z.array(z.string()).describe('Command arguments').default([]),
    env: z
      .record(z.string(), z.string())
      .describe('Extra environment variables')
      .default({}),
  }),
  z.object({
    type: z.literal('http'),
    url: z.url().describe('Streamable HTTP endpoint URL'),
    headers: z
      .record(z.string(), z.string())
      .describe('Extra request headers')
      .default({}),
  }),
]);

export type McpTransport = z.infer<typeof mcpTransportSchema>;

const mcpServerSchema = z.object({
  name: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]*$/)
    .describe(
      'Unique server id; also namespaces its tools as mcp__<name>__<tool>',
    ),
  transport: mcpTransportSchema,
});

export type McpServer = z.infer<typeof mcpServerSchema>;

const enabledByAgentSchema = z.object({
  [AgentType.CHAT]: z
    .array(z.string())
    .describe('Server names enabled for the chat agent')
    .default([]),
  [AgentType.CODING]: z
    .array(z.string())
    .describe('Server names enabled for the coding agent')
    .default([]),
} satisfies Record<AgentType, z.ZodType>);

export const mcpSettingsSchema = z.object({
  servers: z
    .array(mcpServerSchema)
    .describe('Configured MCP servers')
    .default([]),
  enabledByAgent: enabledByAgentSchema.prefault({}),
});

export type McpSettings = z.infer<typeof mcpSettingsSchema>;
