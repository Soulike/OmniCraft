import type {SseSubAgentEvent} from '@omnicraft/sse-events';
import {describe, expect, it} from 'vitest';
import {z} from 'zod';

import {AsyncChannel} from '@/helpers/async-channel.js';

import type {LlmConfig, LlmToolCall} from '../llm-api/index.js';
import type {SkillDefinition} from '../skill/index.js';
import type {
  AnyToolDefinition,
  McpToolDefinition,
  ToolDefinition,
  ToolExecutionContext,
} from '../tool/index.js';
import {AgentRuntimeState} from './agent-runtime-state.js';
import {
  agentToolExecutor,
  type AgentToolSseEvent,
} from './agent-tool-executor.js';
import {SubagentRegistry} from './state/subagent-registry.js';

const MAIN_CONFIG: LlmConfig = {
  apiFormat: 'openai-responses',
  apiKey: 'test-key',
  baseUrl: 'https://example.test',
  model: 'main-model',
  thinkingLevel: 'none',
  maxContextTokens: 200_000,
  maxOutputTokens: 32_000,
};

const LIGHT_CONFIG: LlmConfig = {
  ...MAIN_CONFIG,
  model: 'light-model',
};

async function collectChannel(
  channel: AsyncChannel<AgentToolSseEvent>,
): Promise<AgentToolSseEvent[]> {
  const events: AgentToolSseEvent[] = [];
  for await (const event of channel) {
    events.push(event);
  }
  return events;
}

function executeInput(overrides: {
  readonly toolCall?: LlmToolCall;
  readonly tool?: AnyToolDefinition;
  readonly channel?: AsyncChannel<AgentToolSseEvent>;
}) {
  const toolCall =
    overrides.toolCall ??
    ({
      callId: 'call-1',
      toolName: 'mock_tool',
      arguments: '{"value":"ok"}',
    } satisfies LlmToolCall);
  const channel = overrides.channel ?? new AsyncChannel<AgentToolSseEvent>();
  const availableTools = new Map<string, AnyToolDefinition>();
  if (overrides.tool) {
    availableTools.set(overrides.tool.name, overrides.tool);
  }

  return {
    toolCall,
    availableTools,
    toolSseEventChannel: channel,
    runtimeState: new AgentRuntimeState('/workspace/project'),
    agentId: 'agent-1',
    sessionsDir: '/sessions',
    subagentRegistry: new SubagentRegistry(),
    availableSkills: new Map<string, SkillDefinition>(),
    workingDirectory: '/workspace/project',
    scratchDirectory: '/scratch',
    signal: new AbortController().signal,
    getConfig: () => Promise.resolve(MAIN_CONFIG),
    getTierConfig: () => Promise.resolve(LIGHT_CONFIG),
    channel,
  };
}

describe('AgentToolExecutor', () => {
  it('executes a visible tool and forwards output and subagent events', async () => {
    const receivedContext: {current?: ToolExecutionContext} = {};
    const subAgentEvent: SseSubAgentEvent = {
      type: 'subagent-complete',
      agentId: 'child-agent',
      status: 'success',
    };
    const parameters = z.object({value: z.string()});
    const tool: ToolDefinition<typeof parameters> = {
      kind: 'internal',
      name: 'mock_tool',
      displayName: 'Mock Tool',
      description: 'Tool used by the executor test',
      parameters,
      suppressToolEvents: false,
      execute: (args, context, onOutput) => {
        receivedContext.current = context;
        onOutput?.(`value:${args.value}`);
        context.onSubAgentEvent(subAgentEvent);
        return {
          status: 'success',
          content: `result:${args.value}`,
          data: {message: 'ok'},
        };
      },
    };
    const input = executeInput({tool});
    const eventsPromise = collectChannel(input.channel);

    const result = await agentToolExecutor.execute(input);
    input.channel.close();
    const events = await eventsPromise;

    expect(result).toEqual({
      status: 'success',
      content: 'result:ok',
      data: {message: 'ok'},
    });
    if (!receivedContext.current) {
      throw new Error('Tool did not receive execution context');
    }
    const context = receivedContext.current;
    expect(context.subagentRegistry).toBe(input.subagentRegistry);
    expect(context).toMatchObject({
      callId: 'call-1',
      agentId: 'agent-1',
      sessionsDir: '/sessions',
      workingDirectory: '/workspace/project',
      scratchDirectory: '/scratch',
    });
    expect(events).toEqual([
      {type: 'tool-execute-delta', callId: 'call-1', content: 'value:ok'},
      subAgentEvent,
    ]);
  });

  it('does not create output callbacks for suppressed tools', async () => {
    let onOutputWasProvided = false;
    const tool: ToolDefinition = {
      kind: 'internal',
      name: 'mock_tool',
      displayName: 'Mock Tool',
      description: 'Suppressed tool used by the executor test',
      parameters: z.object({}),
      suppressToolEvents: true,
      execute: (_args, _context, onOutput) => {
        onOutputWasProvided = onOutput !== undefined;
        return {status: 'success', content: 'ok', data: {message: 'ok'}};
      },
    };
    const input = executeInput({
      tool,
      toolCall: {callId: 'call-1', toolName: 'mock_tool', arguments: '{}'},
    });

    const result = await agentToolExecutor.execute(input);

    expect(result.status).toBe('success');
    expect(onOutputWasProvided).toBe(false);
  });

  it('normalizes thrown tool errors into error results', async () => {
    const tool: ToolDefinition = {
      kind: 'internal',
      name: 'mock_tool',
      displayName: 'Mock Tool',
      description: 'Throwing tool used by the executor test',
      parameters: z.object({}),
      suppressToolEvents: false,
      execute: () => {
        throw new Error('tool exploded');
      },
    };
    const input = executeInput({
      tool,
      toolCall: {callId: 'call-1', toolName: 'mock_tool', arguments: '{}'},
    });

    const result = await agentToolExecutor.execute(input);

    expect(result).toEqual({
      status: 'error',
      content: 'Error: tool exploded',
      data: {message: 'tool exploded'},
    });
  });

  it('passes raw parsed arguments to an mcp tool without Zod validation', async () => {
    let receivedArgs: unknown;
    const tool: McpToolDefinition = {
      kind: 'mcp',
      name: 'mcp__fs__read',
      displayName: 'fs: read',
      description: 'Mcp tool used by the executor test',
      suppressToolEvents: false,
      inputJsonSchema: {
        type: 'object',
        properties: {path: {type: 'string'}},
        required: ['path'],
      },
      execute: (args) => {
        receivedArgs = args;
        return {status: 'success', content: 'ok', data: {}};
      },
    };
    const input = executeInput({
      tool,
      toolCall: {
        callId: 'call-1',
        toolName: 'mcp__fs__read',
        arguments: '{"path":"/x"}',
      },
    });

    const result = await agentToolExecutor.execute(input);

    expect(result.status).toBe('success');
    expect(receivedArgs).toEqual({path: '/x'});
  });
});
