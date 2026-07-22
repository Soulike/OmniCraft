import {z} from 'zod';

/** Schema for a single MCP server's connection status and discovered tools. */
export const mcpServerStatusSchema = z.object({
  name: z.string(),
  transportType: z.enum(['stdio', 'http']),
  status: z.enum(['connecting', 'connected', 'error', 'disabled']),
  tools: z.array(z.object({name: z.string(), description: z.string()})),
  error: z.string().optional(),
});

export type McpServerStatusResponse = z.infer<typeof mcpServerStatusSchema>;

/** Schema for the GET /mcp/servers response body. */
export const getMcpServersResponseSchema = z.object({
  servers: z.array(mcpServerStatusSchema),
});

export type GetMcpServersResponse = z.infer<typeof getMcpServersResponseSchema>;
