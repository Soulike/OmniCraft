import {mcpSettingsSchema} from '@omnicraft/settings-schema';
import {z} from 'zod';

/** Schema for a single MCP server's connection status and discovered tools. */
export const mcpServerStatusSchema = z.object({
  name: z.string(),
  transportType: z.enum(['stdio', 'http']),
  status: z.enum(['connecting', 'connected', 'error']),
  tools: z.array(z.object({name: z.string(), description: z.string()})),
  error: z.string().optional(),
});

export type McpServerStatusResponse = z.infer<typeof mcpServerStatusSchema>;

/** Schema for the GET /mcp/servers response body. */
export const getMcpServersResponseSchema = z.object({
  servers: z.array(mcpServerStatusSchema),
});

export type GetMcpServersResponse = z.infer<typeof getMcpServersResponseSchema>;

/**
 * Schema for the PUT /settings/mcp request body. The whole `mcp` settings
 * section is written at once through a dedicated endpoint, because the generic
 * settings API only accepts scalar leaf values (arrays/objects go here).
 */
export const putMcpSettingsRequestSchema = z.object({
  mcp: mcpSettingsSchema,
});

export type PutMcpSettingsRequest = z.infer<typeof putMcpSettingsRequestSchema>;
