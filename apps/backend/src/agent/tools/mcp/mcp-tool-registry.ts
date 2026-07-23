import type {CallToolResult} from '@modelcontextprotocol/sdk/types.js';
import type {AgentType} from '@omnicraft/settings-schema';
import {
  documentMediaTypeSchema,
  imageMediaTypeSchema,
} from '@omnicraft/tool-schemas';

import type {ToolResultBlock} from '@/agent-core/llm-api/tool-result-block.js';
import {toolResultBlocksToText} from '@/agent-core/llm-api/tool-result-block.js';
import type {
  AnyToolDefinition,
  McpToolDefinition,
} from '@/agent-core/tool/index.js';
import {ToolRegistry} from '@/agent-core/tool/index.js';
import {guardMedia} from '@/agent-core/tool/media-guard.js';
import {logger} from '@/logger.js';
import {McpManager} from '@/models/mcp-manager/index.js';

const NAMESPACE_SEPARATOR = '__';

/** Builds the agent-facing name for an MCP tool: `mcp__<server>__<tool>`. */
function namespacedToolName(serverName: string, toolName: string): string {
  return `mcp${NAMESPACE_SEPARATOR}${serverName}${NAMESPACE_SEPARATOR}${toolName}`;
}

/**
 * Builds neutral tool-result blocks from MCP content. Text and embedded-resource
 * text pass through; supported image/PDF media become media blocks (size-guarded);
 * audio and unsupported types become placeholder text blocks. Delivering audio is
 * intentionally unsupported (see https://github.com/Soulike/OmniCraft/issues/368).
 */
export async function buildMcpToolResultBlocks(
  content: CallToolResult['content'],
  scratchDirectory: string,
): Promise<ToolResultBlock[]> {
  const blocks: ToolResultBlock[] = [];
  for (const block of content) {
    switch (block.type) {
      case 'text':
        blocks.push({type: 'text', text: block.text});
        break;
      case 'image': {
        const parsed = imageMediaTypeSchema.safeParse(block.mimeType);
        if (parsed.success) {
          blocks.push(
            await guardMedia({
              data: block.data,
              mediaType: parsed.data,
              scratchDirectory,
            }),
          );
        } else {
          blocks.push({
            type: 'text',
            text: `[unsupported image type: ${block.mimeType}]`,
          });
        }
        break;
      }
      case 'audio':
        blocks.push({
          type: 'text',
          text: `[unsupported audio content (${block.mimeType}): not delivered to the model]`,
        });
        break;
      case 'resource':
        if (
          'text' in block.resource &&
          typeof block.resource.text === 'string'
        ) {
          blocks.push({type: 'text', text: block.resource.text});
        } else {
          blocks.push(
            await blobResourceBlock(block.resource, scratchDirectory),
          );
        }
        break;
      case 'resource_link':
        blocks.push({type: 'text', text: `[resource: ${block.uri}]`});
        break;
    }
  }
  return blocks;
}

async function blobResourceBlock(
  resource: {uri: string; mimeType?: string; blob?: string},
  scratchDirectory: string,
): Promise<ToolResultBlock> {
  const image = imageMediaTypeSchema.safeParse(resource.mimeType);
  const doc = documentMediaTypeSchema.safeParse(resource.mimeType);
  if (typeof resource.blob === 'string' && image.success) {
    return guardMedia({
      data: resource.blob,
      mediaType: image.data,
      scratchDirectory,
    });
  }
  if (typeof resource.blob === 'string' && doc.success) {
    return guardMedia({
      data: resource.blob,
      mediaType: doc.data,
      name: resource.uri,
      scratchDirectory,
    });
  }
  return {type: 'text', text: `[resource: ${resource.uri}]`};
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
            const blocks = await buildMcpToolResultBlocks(
              result.content,
              context.scratchDirectory,
            );
            let text = toolResultBlocksToText(blocks);
            // Output-schema tools can return structured-only results (empty content plus
            // structuredContent); fall back to the serialized structured payload.
            if (!text && result.structuredContent !== undefined) {
              text = JSON.stringify(result.structuredContent);
              blocks.push({type: 'text', text});
            }
            // Some MCP tools return neither content blocks nor structuredContent.
            // An empty tool_result.content array can be rejected by the LLM API
            // (Claude's Messages API previously accepted an empty string), so
            // guarantee at least one block is always sent. Keep `text` in sync so
            // the frontend-facing data.message/data.text matches the model content
            // (an error result must not surface a blank diagnostic).
            if (blocks.length === 0) {
              text = '[no content]';
              blocks.push({type: 'text', text});
            }
            if (result.isError) {
              return {
                content: blocks,
                status: 'failure',
                data: {message: text},
              };
            }
            return {
              content: blocks,
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
