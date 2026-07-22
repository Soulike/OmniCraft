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
  thinkingLevel: 'none',
  maxContextTokens: 200_000,
  maxOutputTokens: 32_000,
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
    kind: 'internal',
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
  const subagentRegistry = overrides.subagentRegistry ?? new SubagentRegistry();
  const defaults: RunAgentTurnInput = {
    userMessage: 'user request',
    agentId: 'agent-1',
    sessionsDir: null,
    subagentRegistry,
    workingDirectory,
    signal: new AbortController().signal,
    llmSession,
    runtimeState: new AgentRuntimeState(workingDirectory),
    toolRegistries: [],
    skillRegistries: [],
    stopChecks: [],
    baseSystemPrompt: '',
    getConfig: () => Promise.resolve(MAIN_CONFIG),
    getTierConfig: () => Promise.resolve(MAIN_CONFIG),
    getMaxToolRounds: () => 5,
    compactAfterTurn: () => Promise.resolve(),
  };

  return {
    ...defaults,
    ...overrides,
    llmSession,
    workingDirectory,
    subagentRegistry,
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

  it('emits a stop-check-reminder and continues when a check fires', async () => {
    vi.spyOn(llmApi, 'countToken').mockResolvedValue(1);
    vi.spyOn(llmApi, 'streamCompletion')
      .mockReturnValueOnce(textCompletionStream('first stop'))
      .mockReturnValueOnce(textCompletionStream('after reminder'));

    let calls = 0;
    const onceCheck = {
      name: 'once',
      evaluate: () => (calls++ === 0 ? {content: 'please reconsider'} : null),
    };

    const events = await collectAll(
      agentTurnRunner.run(createInput({stopChecks: [onceCheck]})),
    );

    const reminder = events.find((e) => e.type === 'stop-check-reminder');
    expect(reminder).toMatchObject({
      type: 'stop-check-reminder',
      checkNames: ['once'],
      content: 'please reconsider',
    });
    expect(events.at(-1)).toMatchObject({type: 'done', reason: 'complete'});
  });

  it('does not emit a user message-start for the reminder round', async () => {
    vi.spyOn(llmApi, 'countToken').mockResolvedValue(1);
    vi.spyOn(llmApi, 'streamCompletion')
      .mockReturnValueOnce(textCompletionStream('first stop'))
      .mockReturnValueOnce(textCompletionStream('after reminder'));

    let calls = 0;
    const onceCheck = {
      name: 'once',
      evaluate: () => (calls++ === 0 ? {content: 'reconsider'} : null),
    };

    const events = await collectAll(
      agentTurnRunner.run(createInput({stopChecks: [onceCheck]})),
    );

    const userStarts = events.filter(
      (e) => e.type === 'message-start' && e.role === 'user',
    );
    expect(userStarts).toHaveLength(1);
  });

  it('merges multiple firing checks into one reminder', async () => {
    vi.spyOn(llmApi, 'countToken').mockResolvedValue(1);
    vi.spyOn(llmApi, 'streamCompletion')
      .mockReturnValueOnce(textCompletionStream('first stop'))
      .mockReturnValueOnce(textCompletionStream('after reminder'));

    let aCalls = 0;
    let bCalls = 0;
    const checkA = {
      name: 'a',
      evaluate: () => (aCalls++ === 0 ? {content: 'alpha'} : null),
    };
    const checkB = {
      name: 'b',
      evaluate: () => (bCalls++ === 0 ? {content: 'beta'} : null),
    };

    const events = await collectAll(
      agentTurnRunner.run(createInput({stopChecks: [checkA, checkB]})),
    );

    const reminder = events.find((e) => e.type === 'stop-check-reminder');
    expect(reminder).toMatchObject({
      checkNames: ['a', 'b'],
      content: 'alpha\n\nbeta',
    });
  });

  it('logs and skips a rejecting check, still merging others', async () => {
    vi.spyOn(llmApi, 'countToken').mockResolvedValue(1);
    vi.spyOn(llmApi, 'streamCompletion')
      .mockReturnValueOnce(textCompletionStream('first stop'))
      .mockReturnValueOnce(textCompletionStream('after reminder'));

    let good = 0;
    const boom = {
      name: 'boom',
      evaluate: () => {
        throw new Error('check failed');
      },
    };
    const ok = {
      name: 'ok',
      evaluate: () => (good++ === 0 ? {content: 'still here'} : null),
    };

    const events = await collectAll(
      agentTurnRunner.run(createInput({stopChecks: [boom, ok]})),
    );

    const reminder = events.find((e) => e.type === 'stop-check-reminder');
    expect(reminder).toMatchObject({checkNames: ['ok'], content: 'still here'});
  });

  it('reminds every round for a check that omits a state token, until max rounds', async () => {
    vi.spyOn(llmApi, 'countToken').mockResolvedValue(1);
    vi.spyOn(llmApi, 'streamCompletion').mockImplementation(() =>
      textCompletionStream('no tools'),
    );

    const always = {
      name: 'always',
      evaluate: () => ({content: 'still not done'}),
    };

    const events = await collectAll(
      agentTurnRunner.run(
        createInput({stopChecks: [always], getMaxToolRounds: () => 2}),
      ),
    );

    expect(events.at(-1)).toMatchObject({
      type: 'done',
      reason: 'max_rounds_reached',
    });
    const reminders = events.filter((e) => e.type === 'stop-check-reminder');
    expect(reminders).toHaveLength(2);
  });

  it('suppresses a repeated reminder when the state token is unchanged', async () => {
    vi.spyOn(llmApi, 'countToken').mockResolvedValue(1);
    vi.spyOn(llmApi, 'streamCompletion').mockImplementation(() =>
      textCompletionStream('no tools'),
    );

    // Same token every boundary: the agent never changed the underlying state.
    const stuck = {
      name: 'stuck',
      evaluate: () => ({content: 'unchanged', stateToken: 'v1'}),
    };

    const events = await collectAll(
      agentTurnRunner.run(
        createInput({stopChecks: [stuck], getMaxToolRounds: () => 5}),
      ),
    );

    const reminders = events.filter((e) => e.type === 'stop-check-reminder');
    expect(reminders).toHaveLength(1);
    expect(events.at(-1)).toMatchObject({type: 'done', reason: 'complete'});
  });

  it('re-fires a reminder when the state token changes', async () => {
    vi.spyOn(llmApi, 'countToken').mockResolvedValue(1);
    vi.spyOn(llmApi, 'streamCompletion').mockImplementation(() =>
      textCompletionStream('no tools'),
    );

    // Token advances each boundary: distinct states each deserve a reminder.
    let version = 0;
    const advancing = {
      name: 'advancing',
      evaluate: () => ({content: 'changed', stateToken: `v${version++}`}),
    };

    const events = await collectAll(
      agentTurnRunner.run(
        createInput({stopChecks: [advancing], getMaxToolRounds: () => 2}),
      ),
    );

    expect(events.at(-1)).toMatchObject({
      type: 'done',
      reason: 'max_rounds_reached',
    });
    const reminders = events.filter((e) => e.type === 'stop-check-reminder');
    expect(reminders).toHaveLength(2);
  });

  it('does not record the de-dup token when max rounds cuts off the reminder', async () => {
    vi.spyOn(llmApi, 'countToken').mockResolvedValue(1);
    vi.spyOn(llmApi, 'streamCompletion').mockImplementation(() =>
      textCompletionStream('no tools'),
    );

    // Same token across both turns: if turn 1 wrongly records it despite never
    // delivering the reminder, turn 2 would suppress it and emit nothing.
    const stuck = {
      name: 'stuck',
      evaluate: () => ({content: 'pending work', stateToken: 'v1'}),
    };
    const runtimeState = new AgentRuntimeState('/workspace/project');

    // Turn 1: budget 0 → the no-tool boundary hits max rounds before sending.
    const firstTurn = await collectAll(
      agentTurnRunner.run(
        createInput({
          stopChecks: [stuck],
          runtimeState,
          getMaxToolRounds: () => 0,
        }),
      ),
    );
    expect(firstTurn.some((e) => e.type === 'stop-check-reminder')).toBe(false);
    expect(firstTurn.at(-1)).toMatchObject({
      type: 'done',
      reason: 'max_rounds_reached',
    });

    // Turn 2: same runtimeState, real budget → the reminder must still fire,
    // because turn 1 never delivered it and so must not have recorded the token.
    const secondTurn = await collectAll(
      agentTurnRunner.run(
        createInput({
          stopChecks: [stuck],
          runtimeState,
          getMaxToolRounds: () => 5,
        }),
      ),
    );
    const reminders = secondTurn.filter(
      (e) => e.type === 'stop-check-reminder',
    );
    expect(reminders).toHaveLength(1);
  });

  it('does not record the token when the reminder response wants tools but is budget-cut', async () => {
    vi.spyOn(llmApi, 'countToken').mockResolvedValue(1);
    // Turn 1: initial response has no tools → reminder fires → the reminder
    // response asks for a tool, but maxRounds=1 cuts off before it runs.
    // Each mock call must yield a FRESH generator (generators are single-use).
    let call = 0;
    vi.spyOn(llmApi, 'streamCompletion').mockImplementation(() => {
      call += 1;
      if (call === 1) return textCompletionStream('no tools yet');
      if (call === 2) {
        return toolCallCompletionStream([
          {callId: 'call-1', toolName: 'mock_tool'},
        ]);
      }
      // Turn 2 streams (fresh budget): no tools so the turn can settle.
      return textCompletionStream('no tools');
    });

    const stuck = {
      name: 'stuck',
      evaluate: () => ({content: 'pending work', stateToken: 'v1'}),
    };
    const runtimeState = new AgentRuntimeState('/workspace/project');
    const tool = createTool({name: 'mock_tool'});

    const firstTurn = await collectAll(
      agentTurnRunner.run(
        createInput({
          stopChecks: [stuck],
          runtimeState,
          toolRegistries: [toolRegistryWith(tool)],
          getMaxToolRounds: () => 1,
        }),
      ),
    );
    // The reminder was delivered, but its tool never executed (budget cut).
    expect(firstTurn.some((e) => e.type === 'stop-check-reminder')).toBe(true);
    expect(firstTurn.some((e) => e.type === 'tool-execute-start')).toBe(false);
    expect(firstTurn.at(-1)).toMatchObject({
      type: 'done',
      reason: 'max_rounds_reached',
    });

    // Turn 2: same unchanged state → the reminder must re-fire, because the
    // agent tried to act (returned a tool call) rather than choosing to stop.
    const secondTurn = await collectAll(
      agentTurnRunner.run(
        createInput({
          stopChecks: [stuck],
          runtimeState,
          getMaxToolRounds: () => 5,
        }),
      ),
    );
    expect(
      secondTurn.filter((e) => e.type === 'stop-check-reminder'),
    ).toHaveLength(1);
  });

  it('rejects a turn with duplicate stop-check names', async () => {
    vi.spyOn(llmApi, 'countToken').mockResolvedValue(1);
    vi.spyOn(llmApi, 'streamCompletion').mockReturnValue(
      textCompletionStream(),
    );

    const a = {name: 'dup', evaluate: () => null};
    const b = {name: 'dup', evaluate: () => null};

    await expect(
      collectAll(agentTurnRunner.run(createInput({stopChecks: [a, b]}))),
    ).rejects.toThrow(/Duplicate stop-check name: dup/);
  });

  it('does not emit a reminder when no check fires', async () => {
    vi.spyOn(llmApi, 'countToken').mockResolvedValue(1);
    vi.spyOn(llmApi, 'streamCompletion').mockReturnValue(
      textCompletionStream(),
    );

    const never = {name: 'never', evaluate: () => null};

    const events = await collectAll(
      agentTurnRunner.run(createInput({stopChecks: [never]})),
    );

    expect(events.some((e) => e.type === 'stop-check-reminder')).toBe(false);
    expect(events.at(-1)).toMatchObject({type: 'done', reason: 'complete'});
  });

  it('treats an empty-content check as not firing (no reminder emitted)', async () => {
    vi.spyOn(llmApi, 'countToken').mockResolvedValue(1);
    vi.spyOn(llmApi, 'streamCompletion').mockReturnValue(
      textCompletionStream(),
    );

    // A check that fires (non-null) but with empty content must not produce a
    // reminder event — the SSE schema requires non-empty content.
    const emptyCheck = {name: 'empty', evaluate: () => ({content: ''})};

    const events = await collectAll(
      agentTurnRunner.run(createInput({stopChecks: [emptyCheck]})),
    );

    expect(events.some((e) => e.type === 'stop-check-reminder')).toBe(false);
    expect(events.at(-1)).toMatchObject({type: 'done', reason: 'complete'});
  });
});
