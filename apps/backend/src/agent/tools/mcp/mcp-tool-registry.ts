import type {AgentType} from '@omnicraft/settings-schema';

import type {
  AnyToolDefinition,
  McpToolDefinition,
} from '@/agent-core/tool/index.js';
import {ToolRegistry} from '@/agent-core/tool/index.js';
import {McpManager} from '@/models/mcp-manager/index.js';

const NAMESPACE_SEPARATOR = '__';

function toolName(server: string, tool: string): string {
  return `mcp${NAMESPACE_SEPARATOR}${server}${NAMESPACE_SEPARATOR}${tool}`;
}

/** Presents a manager's MCP tools as ToolDefinitions for one agent kind. */
export class McpToolRegistry extends ToolRegistry {
  constructor(
    private readonly agentType: AgentType,
    private readonly manager: McpManager = McpManager.getInstance(),
  ) {
    super();
  }

  override getAll(): AnyToolDefinition[] {
    const out: McpToolDefinition[] = [];
    for (const {server, tools} of this.manager.getToolsForAgent(
      this.agentType,
    )) {
      for (const tool of tools) {
        out.push({
          kind: 'mcp',
          name: toolName(server, tool.name),
          displayName: tool.title ?? `${server}: ${tool.name}`,
          description: tool.description,
          suppressToolEvents: false,
          inputJsonSchema: tool.inputSchema,
          execute: async (args, context) => {
            const result = await this.manager.callTool(
              server,
              tool.name,
              args,
              context.signal,
            );
            if (result.isError) {
              return {
                content: result.text,
                status: 'failure',
                data: {message: result.text},
              };
            }
            return {
              content: result.text,
              status: 'success',
              data: {server, toolName: tool.name, text: result.text},
            };
          },
        });
      }
    }
    return out;
  }

  override get(name: string): AnyToolDefinition | undefined {
    return this.getAll().find((tool) => tool.name === name);
  }

  override getSystemPromptSection(): string {
    const servers = this.manager
      .getToolsForAgent(this.agentType)
      .filter((s) => s.tools.length > 0);
    if (servers.length === 0) return '';
    const lines = servers.map(
      (s) => `- ${s.server}: ${s.tools.length} tool(s)`,
    );
    return ['## MCP Servers', '', 'Connected MCP servers:', ...lines].join(
      '\n',
    );
  }
}

const registries = new Map<AgentType, McpToolRegistry>();

/** Shared, lazily-created MCP tool registry for an agent type. */
export function getMcpToolRegistry(agentType: AgentType): McpToolRegistry {
  const existing = registries.get(agentType);
  if (existing) return existing;
  const registry = new McpToolRegistry(agentType);
  registries.set(agentType, registry);
  return registry;
}
