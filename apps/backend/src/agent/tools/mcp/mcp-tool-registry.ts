import type {CallToolResult} from '@modelcontextprotocol/sdk/types.js';
import type {AgentType} from '@omnicraft/settings-schema';

import type {
  AnyToolDefinition,
  McpToolDefinition,
} from '@/agent-core/tool/index.js';
import {ToolRegistry} from '@/agent-core/tool/index.js';
import {logger} from '@/logger.js';
import {McpManager} from '@/models/mcp-manager/index.js';

const NAMESPACE_SEPARATOR = '__';

/** Builds the agent-facing name for an MCP tool: `mcp__<server>__<tool>`. */
function namespacedToolName(serverName: string, toolName: string): string {
  return `mcp${NAMESPACE_SEPARATOR}${serverName}${NAMESPACE_SEPARATOR}${toolName}`;
}

/**
 * Renders an MCP tool result's content blocks into text for the model. The
 * tool-result channel is text-only, so text (and embedded-resource text) pass
 * through, while media/link blocks become compact placeholders — their bytes
 * are deliberately not dumped into the model's context. Blocks are joined with
 * newlines (the spec does not prescribe a separator; this is a client choice).
 *
 * Delivering non-text content to the model is tracked in
 * https://github.com/Soulike/OmniCraft/issues/368.
 */
function renderContentText(content: CallToolResult['content']): string {
  return content
    .map((block) => {
      switch (block.type) {
        case 'text':
          return block.text;
        case 'resource':
          return 'text' in block.resource &&
            typeof block.resource.text === 'string'
            ? block.resource.text
            : `[resource: ${block.resource.uri}]`;
        case 'resource_link':
          return `[resource: ${block.uri}]`;
        case 'image':
        case 'audio':
          return `[${block.type}: ${block.mimeType}]`;
      }
    })
    .join('\n');
}

/** Presents a manager's MCP tools as ToolDefinitions for one agent type. */
export class McpToolRegistry extends ToolRegistry {
  constructor(
    private readonly agentType: AgentType,
    private readonly manager: McpManager = McpManager.getInstance(),
  ) {
    super();
  }

  override getAll(): AnyToolDefinition[] {
    const definitions: McpToolDefinition[] = [];
    const seenNames = new Set<string>();
    for (const {serverName, tools} of this.manager.getToolsForAgent(
      this.agentType,
    )) {
      for (const tool of tools) {
        const name = namespacedToolName(serverName, tool.name);
        // A non-compliant MCP server can list the same tool name twice.
        // Keep the first occurrence and drop the rest so a single malformed
        // server can't make buildAvailableTools() throw on a duplicate name
        // and block every turn.
        if (seenNames.has(name)) {
          logger.warn(
            {serverName, tool: tool.name},
            'MCP server returned a duplicate tool name; dropping the duplicate',
          );
          continue;
        }
        seenNames.add(name);
        definitions.push({
          kind: 'mcp',
          name,
          displayName: tool.title ?? `${serverName}: ${tool.name}`,
          description: tool.description ?? '',
          suppressToolEvents: false,
          inputJsonSchema: tool.inputSchema,
          execute: async (args, context) => {
            const result = await this.manager.callTool(
              serverName,
              tool.name,
              // MCP tools are not Zod-validated; the model's arguments arrive
              // as untyped JSON. Assert the object shape the SDK requires.
              args as Record<string, unknown> | undefined,
              context.signal,
            );
            // Render the MCP content blocks to text for the model; media
            // blocks become placeholders (see renderContentText).
            const text = renderContentText(result.content);
            if (result.isError) {
              return {content: text, status: 'failure', data: {message: text}};
            }
            return {
              content: text,
              status: 'success',
              data: {server: serverName, toolName: tool.name, text},
            };
          },
        });
      }
    }
    return definitions;
  }

  override get(name: string): AnyToolDefinition | undefined {
    return this.getAll().find((tool) => tool.name === name);
  }

  override getSystemPromptSection(): string {
    const serversWithTools = this.manager
      .getToolsForAgent(this.agentType)
      .filter((entry) => entry.tools.length > 0);
    if (serversWithTools.length === 0) return '';
    const lines = serversWithTools.map(
      (entry) => `- ${entry.serverName}: ${entry.tools.length} tool(s)`,
    );
    return ['## MCP Servers', '', 'Connected MCP servers:', ...lines].join(
      '\n',
    );
  }
}

const agentTypeToRegistries = new Map<AgentType, McpToolRegistry>();

/** Shared, lazily-created MCP tool registry for an agent type. */
export function getMcpToolRegistry(agentType: AgentType): McpToolRegistry {
  const existing = agentTypeToRegistries.get(agentType);
  if (existing) return existing;
  const registry = new McpToolRegistry(agentType);
  agentTypeToRegistries.set(agentType, registry);
  return registry;
}
