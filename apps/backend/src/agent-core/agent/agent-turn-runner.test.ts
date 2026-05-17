import type {SseEvent} from '@omnicraft/sse-events';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {z} from 'zod';

import {llmApi, type LlmConfig, type LlmEventStream} from '../llm-api/index.js';
import {LlmSession} from '../llm-session/index.js';
import type {ToolDefinition} from '../tool/index.js';
import {ToolRegistry} from '../tool/tool-registry.js';
import {AgentRuntimeState} from './agent-runtime-state.js';
import {agentTurnRunner, type RunAgentTurnInput} from './agent-turn-runner.js';
import {SubagentRegistry} from './state/subagent-registry.js';

const MAIN_CONFIG: LlmConfig = {
  apiFormat: 'openai-responses',
  apiKey: 'test-key',
  baseUrl: 'https://example.test',
  model: 'main-model',
};

class TestToolRegistry extends ToolRegistry {
  static createForTest(): TestToolRegistry {
    return new TestToolRegistry();
  }

  public override register(tool: ToolDefinition): void {
    super.register(tool);
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function collectAll(
  stream: AsyncGenerator<Exclude<SseEvent, {type: 'error'}>, void, undefined>,
): Promise<Exclude<SseEvent, {type: 'error'}>[]> {
  const events: Exclude<SseEvent, {type: 'error'}>[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

async function* textCompletionStream(content = 'done'): LlmEventStream {
  yield {type: 'message-start', messageId: 'assistant-message'};
  await Promise.resolve();
  yield {type: 'text-delta', content};
  yield {
    type: 'message-end',
    stopReason: 'end_turn',
    usage: {inputTokens: 1, outputTokens: 1, cacheReadInputTokens: 0},
  };
}

async function* toolCallCompletionStream(
  calls: readonly {
    readonly callId: string;
    readonly toolName: string;
    readonly args?: string;
  }[],
): LlmEventStream {
  yield {type: 'message-start', messageId: 'assistant-tool-message'};
  await Promise.resolve();
  for (const call of calls) {
    yield {
      type: 'tool-call-start',
      callId: call.callId,
      toolName: call.toolName,
    };
    yield {
      type: 'tool-call-delta',
      callId: call.callId,
      argumentsDelta: call.args ?? '{}',
    };
    yield {type: 'tool-call-end', callId: call.callId};
  }
  yield {
    type: 'message-end',
    stopReason: 'tool_use',
    usage: {inputTokens: 1, outputTokens: 1, cacheReadInputTokens: 0},
  };
}

function createTool({
  name,
  content = name,
  delayMs = 0,
  onOutput,
}: {
  readonly name: string;
  readonly content?: string;
  readonly delayMs?: number;
  readonly onOutput?: string;
}): ToolDefinition {
  return {
    name,
    displayName: `Tool ${name}`,
    description: `Test tool ${name}`,
    parameters: z.object({}),
    suppressToolEvents: false,
    execute: async (_args, _context, output) => {
      if (delayMs > 0) await delay(delayMs);
      if (onOutput) output?.(onOutput);
      return {
        status: 'success',
        content,
        data: {message: content},
      };
    },
  };
}

function toolRegistryWith(...tools: ToolDefinition[]): ToolRegistry {
  const registry = TestToolRegistry.createForTest();
  for (const tool of tools) {
    registry.register(tool);
  }
  return registry;
}

function createInput(
  overrides: Partial<RunAgentTurnInput> = {},
): RunAgentTurnInput {
  const llmSession =
    overrides.llmSession ?? new LlmSession(() => Promise.resolve(MAIN_CONFIG));
  const workingDirectory = overrides.workingDirectory ?? '/workspace/project';
  const subagents = overrides.subagents ?? new SubagentRegistry();
  const defaults: RunAgentTurnInput = {
    userMessage: 'user request',
    agentId: 'agent-1',
    sessionsDir: null,
    subagents,
    workingDirectory,
    thinkingLevel: 'high',
    signal: new AbortController().signal,
    llmSession,
    runtimeState: new AgentRuntimeState(workingDirectory),
    toolRegistries: [],
    skillRegistries: [],
    baseSystemPrompt: '',
    getConfig: () => Promise.resolve(MAIN_CONFIG),
    getLightConfig: () => Promise.resolve(MAIN_CONFIG),
    getMaxToolRounds: () => 5,
    compactAfterTurn: () => Promise.resolve(),
  };

  return {
    ...defaults,
    ...overrides,
    llmSession,
    workingDirectory,
    subagents,
  };
}

describe('AgentTurnRunner', () => {
  it('emits final usage after turn-end compaction and before done', async () => {
    vi.spyOn(llmApi, 'countToken').mockResolvedValue(1);
    vi.spyOn(llmApi, 'streamCompletion').mockReturnValue(
      textCompletionStream(),
    );
    const order: string[] = [];
    const events = await collectAll(
      agentTurnRunner.run(
        createInput({
          compactAfterTurn: () => {
            order.push('compact');
            return Promise.resolve();
          },
        }),
      ),
    );

    const doneIndex = events.findIndex((event) => event.type === 'done');
    expect(doneIndex).toBeGreaterThanOrEqual(0);
    expect(events[doneIndex - 1]?.type).toBe('usage-update');
    expect(events.at(-1)).toMatchObject({type: 'done', reason: 'complete'});
    expect(order).toEqual(['compact']);
  });

  it('stops before executing tools when max rounds is reached', async () => {
    vi.spyOn(llmApi, 'countToken').mockResolvedValue(1);
    const streamSpy = vi
      .spyOn(llmApi, 'streamCompletion')
      .mockReturnValue(
        toolCallCompletionStream([{callId: 'call-1', toolName: 'mock_tool'}]),
      );
    const tool = createTool({name: 'mock_tool'});

    const events = await collectAll(
      agentTurnRunner.run(
        createInput({
          toolRegistries: [toolRegistryWith(tool)],
          getMaxToolRounds: () => 0,
        }),
      ),
    );

    expect(events.at(-1)).toMatchObject({
      type: 'done',
      reason: 'max_rounds_reached',
    });
    expect(events.some((event) => event.type === 'tool-execute-start')).toBe(
      false,
    );
    expect(streamSpy).toHaveBeenCalledTimes(1);
  });

  it('submits an unknown tool as a failure result and continues', async () => {
    vi.spyOn(llmApi, 'countToken').mockResolvedValue(1);
    const streamSpy = vi
      .spyOn(llmApi, 'streamCompletion')
      .mockReturnValueOnce(
        toolCallCompletionStream([
          {callId: 'call-missing', toolName: 'missing_tool'},
        ]),
      )
      .mockReturnValueOnce(textCompletionStream('after missing tool'));

    const events = await collectAll(agentTurnRunner.run(createInput()));

    const secondCallOptions = streamSpy.mock.calls[1]?.[0];
    expect(secondCallOptions).toBeDefined();
    const toolMessages = secondCallOptions.messages.filter(
      (message) => message.role === 'tool',
    );
    expect(toolMessages).toMatchObject([
      {
        role: 'tool',
        callId: 'call-missing',
        status: 'failure',
        content: 'Error: Unknown tool: missing_tool',
      },
    ]);
    expect(events.some((event) => event.type === 'tool-execute-start')).toBe(
      false,
    );
    expect(events.at(-1)).toMatchObject({type: 'done', reason: 'complete'});
  });

  it('submits tool results in the original tool-call order', async () => {
    vi.spyOn(llmApi, 'countToken').mockResolvedValue(1);
    const streamSpy = vi
      .spyOn(llmApi, 'streamCompletion')
      .mockReturnValueOnce(
        toolCallCompletionStream([
          {callId: 'call-slow', toolName: 'slow_tool'},
          {callId: 'call-fast', toolName: 'fast_tool'},
        ]),
      )
      .mockReturnValueOnce(textCompletionStream('after tools'));
    const slowTool = createTool({
      name: 'slow_tool',
      content: 'slow result',
      delayMs: 20,
    });
    const fastTool = createTool({name: 'fast_tool', content: 'fast result'});

    const events = await collectAll(
      agentTurnRunner.run(
        createInput({toolRegistries: [toolRegistryWith(slowTool, fastTool)]}),
      ),
    );

    const secondCallOptions = streamSpy.mock.calls[1]?.[0];
    expect(secondCallOptions).toBeDefined();
    const toolMessages = secondCallOptions.messages.filter(
      (message) => message.role === 'tool',
    );
    expect(toolMessages.map((message) => message.callId)).toEqual([
      'call-slow',
      'call-fast',
    ]);
    expect(toolMessages.map((message) => message.content)).toEqual([
      'slow result',
      'fast result',
    ]);
    expect(events.at(-1)).toMatchObject({type: 'done', reason: 'complete'});
  });

  it('emits synthetic tool end events for visible tools aborted in flight', async () => {
    vi.spyOn(llmApi, 'countToken').mockResolvedValue(1);
    vi.spyOn(llmApi, 'streamCompletion').mockReturnValue(
      toolCallCompletionStream([{callId: 'call-1', toolName: 'mock_tool'}]),
    );
    const controller = new AbortController();
    const tool = createTool({
      name: 'mock_tool',
      delayMs: 5,
      onOutput: 'still running',
    });
    const events: Exclude<SseEvent, {type: 'error'}>[] = [];

    for await (const event of agentTurnRunner.run(
      createInput({
        signal: controller.signal,
        toolRegistries: [toolRegistryWith(tool)],
      }),
    )) {
      events.push(event);
      if (event.type === 'tool-execute-start') {
        controller.abort();
      }
    }

    expect(events).toContainEqual({
      type: 'tool-execute-delta',
      callId: 'call-1',
      content: 'still running',
    });
    expect(events).toContainEqual({
      type: 'tool-execute-end',
      callId: 'call-1',
      result: 'Aborted',
      status: 'error',
      data: {message: 'Aborted'},
    });
    expect(events.at(-1)).toMatchObject({type: 'done', reason: 'aborted'});
  });
});
