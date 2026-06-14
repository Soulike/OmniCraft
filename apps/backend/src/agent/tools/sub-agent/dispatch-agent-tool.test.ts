import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {SubAgentType} from '@omnicraft/api-schema';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {ExploreSubAgent, GeneralSubAgent} from '@/agent/agents/index.js';
import type {Agent} from '@/agent-core/agent/index.js';
import {createMockContext} from '@/agent-core/tool/testing.js';
import type {ToolExecutionContext} from '@/agent-core/tool/types.js';

import {
  createSubAgent,
  dispatchAgentTool,
  getSubagentSessionsDir,
  registerSubAgent,
} from './dispatch-agent-tool.js';
import {
  buildSubagentOutputEvent,
  runSubagentTurn,
} from './subagent-turn-runner.js';

function emptyUsage() {
  return {
    currentContextInputTokens: 0,
    latestCallOutputTokens: 0,
    sessionInputTokens: 0,
    sessionOutputTokens: 0,
    sessionCacheReadInputTokens: 0,
  };
}

function createForwardingMockSubagent(
  workingDirectory: string,
  onEnqueueUserTurn?: () => void,
): Agent & {
  readonly handledMessages: string[];
} {
  const handledMessages: string[] = [];
  const subagent = {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Forwarding Subagent',
    sseLog: {activeReaderCount: 0},
    handledMessages,
    enqueueUserTurn(message: string) {
      onEnqueueUserTurn?.();
      handledMessages.push(message);
    },
    abort() {
      return undefined;
    },
    async *subscribe() {
      await Promise.resolve();
      yield {
        nextIndex: 1,
        event: {
          type: 'message-start',
          role: 'assistant',
          messageId: 'assistant-1',
          createdAt: 1,
          content: '',
        },
      };
      yield {nextIndex: 2, event: {type: 'text-delta', content: 'done'}};
      yield {nextIndex: 3, event: {type: 'done', reason: 'complete'}};
    },
    getWorkingDirectory() {
      return workingDirectory;
    },
    getThinkingLevel() {
      return 'none' as const;
    },
    getSseEventCount() {
      return 0;
    },
    toSnapshot() {
      throw new Error('runSubagentTurn should not snapshot subagents');
    },
  } as unknown as Agent & {readonly handledMessages: string[]};

  Object.defineProperty(subagent, 'isRunning', {get: () => false});
  return subagent;
}

function createResumedTurnMockSubagent(workingDirectory: string): Agent & {
  readonly handledMessages: string[];
  readonly subscribedStartIndexes: (number | undefined)[];
} {
  const handledMessages: string[] = [];
  const subscribedStartIndexes: (number | undefined)[] = [];
  const events = [
    {
      type: 'message-start',
      role: 'assistant',
      messageId: 'old-assistant',
      createdAt: 1,
      content: '',
    },
    {type: 'text-delta', content: 'old summary'},
    {type: 'done', reason: 'complete'},
    {
      type: 'message-start',
      role: 'assistant',
      messageId: 'new-assistant',
      createdAt: 2,
      content: '',
    },
    {type: 'text-delta', content: 'new summary'},
    {type: 'done', reason: 'complete'},
  ] as const;
  const subagent = {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Resumed Subagent',
    sseLog: {activeReaderCount: 0},
    handledMessages,
    subscribedStartIndexes,
    enqueueUserTurn(message: string) {
      handledMessages.push(message);
    },
    abort() {
      return undefined;
    },
    async *subscribe(options?: {startIndex?: number; signal?: AbortSignal}) {
      subscribedStartIndexes.push(options?.startIndex);
      await Promise.resolve();
      for (const [index, event] of events.entries()) {
        if (index < (options?.startIndex ?? 0)) continue;
        yield {nextIndex: index + 1, event};
      }
    },
    getWorkingDirectory() {
      return workingDirectory;
    },
    getThinkingLevel() {
      return 'none' as const;
    },
    getSseEventCount() {
      return 3;
    },
    toSnapshot() {
      throw new Error('runSubagentTurn should not snapshot subagents');
    },
  } as unknown as Agent & {
    readonly handledMessages: string[];
    readonly subscribedStartIndexes: (number | undefined)[];
  };

  Object.defineProperty(subagent, 'isRunning', {get: () => false});
  return subagent;
}

describe('dispatchAgentTool', () => {
  let tmpDir: string;
  let context: ToolExecutionContext;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dispatch-agent-test-'));
    context = createMockContext({workingDirectory: tmpDir});
  });

  afterEach(async () => {
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  it('has the correct name', () => {
    expect(dispatchAgentTool.name).toBe('dispatch_agent');
  });

  it('accepts the explore agent type', () => {
    const result = dispatchAgentTool.parameters.safeParse({
      task: 'Map the backend agent architecture',
      agentType: SubAgentType.EXPLORE,
    });

    expect(result.success).toBe(true);
  });

  it('documents general and explore agent types', () => {
    expect(dispatchAgentTool.description).toContain(
      `- ${SubAgentType.GENERAL} (General):`,
    );
    expect(dispatchAgentTool.description).toContain(
      `- ${SubAgentType.EXPLORE} (Explore):`,
    );
  });

  it('documents when dispatching a subagent is useful', () => {
    expect(dispatchAgentTool.description).toContain(
      'can proceed independently',
    );
    expect(dispatchAgentTool.description).toContain(
      'Keep very small local lookups local',
    );
    expect(dispatchAgentTool.description).toContain(
      'synthesize the subagent result',
    );
  });

  it('documents that the result includes the subagent name', () => {
    expect(dispatchAgentTool.description).toContain(
      'includes the subagent name',
    );
  });

  it('documents explore-specific research use cases', () => {
    expect(dispatchAgentTool.description).toContain(
      `- ${SubAgentType.EXPLORE} (Explore):`,
    );
    expect(dispatchAgentTool.description).toContain('architecture');
    expect(dispatchAgentTool.description).toContain('data flow');
    expect(dispatchAgentTool.description).toContain('impact analysis');
    expect(dispatchAgentTool.description).toContain(
      'Do not specify a report format unless the user asked for one',
    );
  });

  it('creates a general subagent by default', () => {
    const subagent = createSubAgent(
      SubAgentType.GENERAL,
      context.getConfig,
      tmpDir,
      'none',
    );

    expect(subagent).toBeInstanceOf(GeneralSubAgent);
  });

  it('creates an explore subagent for explore tasks', () => {
    const subagent = createSubAgent(
      SubAgentType.EXPLORE,
      context.getConfig,
      tmpDir,
      'none',
    );

    expect(subagent).toBeInstanceOf(ExploreSubAgent);
  });

  it('computes a child sessions directory from parent persistence context', () => {
    const parentSessionsDir = path.join(tmpDir, 'coding-sessions');
    const result = getSubagentSessionsDir(
      createMockContext({
        agentId: 'parent-agent-id',
        sessionsDir: parentSessionsDir,
      }),
    );

    expect(result).toBe(
      path.join(parentSessionsDir, 'parent-agent-id', 'subagents'),
    );
  });

  it('keeps subagents in memory when parent has no sessions directory', () => {
    const result = getSubagentSessionsDir(
      createMockContext({sessionsDir: null}),
    );

    expect(result).toBeUndefined();
  });

  it('persists a general subagent when sessionsDir is provided', async () => {
    const sessionsDir = path.join(tmpDir, 'subagents');
    const subagent = createSubAgent(
      SubAgentType.GENERAL,
      context.getConfig,
      tmpDir,
      'none',
      sessionsDir,
    );

    const snapshotContent = await fs.readFile(
      path.join(sessionsDir, subagent.id, 'snapshot.json'),
      'utf-8',
    );
    const metadataContent = await fs.readFile(
      path.join(sessionsDir, subagent.id, 'metadata.json'),
      'utf-8',
    );
    const snapshot: unknown = JSON.parse(snapshotContent);
    const metadata: unknown = JSON.parse(metadataContent);

    expect(snapshot).toMatchObject({
      id: subagent.id,
      title: 'New Session',
      sseEventCount: 0,
      llmSession: {
        messages: [],
        compactions: [],
        latestUsageInputMessageCount: null,
        usage: emptyUsage(),
      },
      options: {workingDirectory: tmpDir, thinkingLevel: 'none'},
    });
    expect(metadata).toEqual({
      id: subagent.id,
      title: 'New Session',
      workingDirectory: tmpDir,
    });
  });

  it('persists an explore subagent when sessionsDir is provided', async () => {
    const sessionsDir = path.join(tmpDir, 'subagents');
    const subagent = createSubAgent(
      SubAgentType.EXPLORE,
      context.getConfig,
      tmpDir,
      'none',
      sessionsDir,
    );

    const snapshotContent = await fs.readFile(
      path.join(sessionsDir, subagent.id, 'snapshot.json'),
      'utf-8',
    );
    const metadataContent = await fs.readFile(
      path.join(sessionsDir, subagent.id, 'metadata.json'),
      'utf-8',
    );
    const snapshot: unknown = JSON.parse(snapshotContent);
    const metadata: unknown = JSON.parse(metadataContent);

    expect(snapshot).toMatchObject({
      id: subagent.id,
      title: 'New Session',
      sseEventCount: 0,
      llmSession: {
        messages: [],
        compactions: [],
        latestUsageInputMessageCount: null,
        usage: emptyUsage(),
      },
      options: {workingDirectory: tmpDir, thinkingLevel: 'none'},
    });
    expect(metadata).toEqual({
      id: subagent.id,
      title: 'New Session',
      workingDirectory: tmpDir,
    });
  });

  it('registers the dispatched live subagent in the parent context registry', () => {
    const subagent = {
      id: '11111111-1111-4111-8111-111111111111',
      title: 'Live Subagent',
      sseLog: {activeReaderCount: 0},
    } as Agent;

    Object.defineProperty(subagent, 'isRunning', {
      get: () => false,
    });

    registerSubAgent(context, subagent, SubAgentType.EXPLORE, 'crimson-otter');

    expect(context.subagentRegistry.get(subagent.id)).toEqual({
      agent: subagent,
      agentType: SubAgentType.EXPLORE,
      nickname: 'crimson-otter',
    });
    expect(context.subagentRegistry.list()).toEqual([
      {
        id: subagent.id,
        agentType: SubAgentType.EXPLORE,
        title: 'Live Subagent',
        nickname: 'crimson-otter',
        isRunning: false,
      },
    ]);
  });

  it('forwards dispatched subagent events and registers after the turn starts', async () => {
    const events: unknown[] = [];
    const order: string[] = [];
    const dispatchContext = createMockContext({
      workingDirectory: tmpDir,
      onSubAgentEvent: (event) => {
        events.push(event);
      },
    });
    const subagent = createForwardingMockSubagent(tmpDir, () => {
      order.push('enqueueUserTurn');
      expect(dispatchContext.subagentRegistry.get(subagent.id)).toBeUndefined();
    });

    const result = await runSubagentTurn({
      context: dispatchContext,
      subagent,
      nickname: 'crimson-otter',
      startEvent: {
        type: 'subagent-dispatch',
        agentId: subagent.id,
        nickname: 'crimson-otter',
        task: 'Inspect the code',
        agentType: SubAgentType.GENERAL,
        thinkingLevel: 'none',
        workingDirectory: tmpDir,
      },
      startTurn: () => {
        subagent.enqueueUserTurn('Inspect the code');
        return true;
      },
      onTurnStarted: () => {
        order.push('onTurnStarted');
        registerSubAgent(
          dispatchContext,
          subagent,
          SubAgentType.GENERAL,
          'crimson-otter',
        );
      },
    });

    expect(result).toMatchObject({
      status: 'success',
      data: {summary: 'done', agentId: subagent.id},
      content: `<subagent_name>crimson-otter</subagent_name>\n\ndone`,
    });
    expect(subagent.handledMessages).toEqual(['Inspect the code']);
    expect(order).toEqual(['enqueueUserTurn', 'onTurnStarted']);
    expect(dispatchContext.subagentRegistry.get(subagent.id)?.agent).toBe(
      subagent,
    );
    expect(events).toEqual([
      expect.objectContaining({type: 'subagent-dispatch'}),
      expect.objectContaining({type: 'subagent-output'}),
      expect.objectContaining({type: 'subagent-output'}),
      expect.objectContaining({type: 'subagent-output'}),
      {type: 'subagent-complete', agentId: subagent.id, status: 'success'},
    ]);
  });

  it('streams a resumed turn from the current subagent log end', async () => {
    const events: unknown[] = [];
    const dispatchContext = createMockContext({
      workingDirectory: tmpDir,
      onSubAgentEvent: (event) => {
        events.push(event);
      },
    });
    const subagent = createResumedTurnMockSubagent(tmpDir);

    const result = await runSubagentTurn({
      context: dispatchContext,
      subagent,
      nickname: 'crimson-otter',
      startEvent: {
        type: 'subagent-dispatch',
        agentId: subagent.id,
        nickname: 'crimson-otter',
        task: 'Continue the work',
        agentType: SubAgentType.GENERAL,
        thinkingLevel: 'none',
        workingDirectory: tmpDir,
      },
      startTurn: () => {
        subagent.enqueueUserTurn('Continue the work');
        return true;
      },
    });

    expect(result).toMatchObject({
      status: 'success',
      data: {summary: 'new summary', agentId: subagent.id},
      content: `<subagent_name>crimson-otter</subagent_name>\n\nnew summary`,
    });
    expect(subagent.handledMessages).toEqual(['Continue the work']);
    expect(subagent.subscribedStartIndexes).toEqual([3]);
    expect(events).toEqual([
      expect.objectContaining({type: 'subagent-dispatch'}),
      expect.objectContaining({
        type: 'subagent-output',
        event: {
          type: 'message-start',
          role: 'assistant',
          messageId: 'new-assistant',
          createdAt: 2,
          content: '',
        },
      }),
      expect.objectContaining({
        type: 'subagent-output',
        event: {type: 'text-delta', content: 'new summary'},
      }),
      expect.objectContaining({
        type: 'subagent-output',
        event: {type: 'done', reason: 'complete'},
      }),
      {type: 'subagent-complete', agentId: subagent.id, status: 'success'},
    ]);
  });

  it('does not start the subagent when the parent signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const events: unknown[] = [];
    const dispatchContext = createMockContext({
      signal: controller.signal,
      workingDirectory: tmpDir,
      onSubAgentEvent: (event) => {
        events.push(event);
      },
    });
    const subagent = createResumedTurnMockSubagent(tmpDir);

    const result = await runSubagentTurn({
      context: dispatchContext,
      subagent,
      nickname: 'crimson-otter',
      startEvent: {
        type: 'subagent-dispatch',
        agentId: subagent.id,
        nickname: 'crimson-otter',
        task: 'Continue the work',
        agentType: SubAgentType.GENERAL,
        thinkingLevel: 'none',
        workingDirectory: tmpDir,
      },
      startTurn: () => {
        subagent.enqueueUserTurn('Continue the work');
        return true;
      },
    });

    expect(result).toMatchObject({
      status: 'failure',
      data: {message: 'Subagent was aborted'},
      content: 'Subagent was aborted.',
    });
    expect(subagent.handledMessages).toEqual([]);
    expect(subagent.subscribedStartIndexes).toEqual([]);
    expect(events).toEqual([
      expect.objectContaining({type: 'subagent-dispatch'}),
      {type: 'subagent-complete', agentId: subagent.id, status: 'failure'},
    ]);
  });

  it('returns a busy failure and emits no events when startTurn rejects', async () => {
    const events: unknown[] = [];
    const dispatchContext = createMockContext({
      workingDirectory: tmpDir,
      onSubAgentEvent: (event) => {
        events.push(event);
      },
    });
    const subagent = createForwardingMockSubagent(tmpDir);

    const result = await runSubagentTurn({
      context: dispatchContext,
      subagent,
      nickname: 'crimson-otter',
      startEvent: {
        type: 'subagent-resume',
        agentId: subagent.id,
        nickname: 'crimson-otter',
        task: 'Continue the work',
        agentType: SubAgentType.GENERAL,
        thinkingLevel: 'none',
        workingDirectory: tmpDir,
      },
      startTurn: () => false,
    });

    expect(result.status).toBe('failure');
    expect(result.content).toContain('already running');
    expect(subagent.handledMessages).toEqual([]);
    expect(events).toEqual([]);
  });

  describe('subagent output event wrapping', () => {
    const agentId = '11111111-1111-4111-8111-111111111111';

    it('wraps non-recursive agent events', () => {
      const event = {type: 'session-title', title: 'Multiplication'} as const;

      expect(buildSubagentOutputEvent(agentId, event)).toEqual({
        type: 'subagent-output',
        agentId,
        event,
      });
    });

    it('throws at the dispatch boundary for recursive subagent events', () => {
      expect(() =>
        buildSubagentOutputEvent(agentId, {
          type: 'subagent-complete',
          agentId,
          status: 'success',
        }),
      ).toThrow();
    });
  });

  describe('workingDirectory boundary check', () => {
    it('rejects an absolute path outside the parent working directory', async () => {
      const outside = await fs.mkdtemp(
        path.join(os.tmpdir(), 'dispatch-agent-outside-'),
      );
      try {
        const result = await dispatchAgentTool.execute(
          {task: 't', workingDirectory: outside},
          context,
        );

        expect(result.status).toBe('failure');
        expect(result.content).toContain(
          `is outside the parent agent's working directory`,
        );
      } finally {
        await fs.rm(outside, {recursive: true, force: true});
      }
    });

    it('rejects a relative path that escapes via ..', async () => {
      const result = await dispatchAgentTool.execute(
        {task: 't', workingDirectory: '../escape'},
        context,
      );

      expect(result.status).toBe('failure');
      expect(result.content).toContain(
        `is outside the parent agent's working directory`,
      );
    });

    it('rejects a sibling path with a shared prefix', async () => {
      // Guards against the classic `/a/b` vs `/a/bc` prefix-trick.
      const sibling = `${tmpDir}-sibling`;
      await fs.mkdir(sibling);
      try {
        const result = await dispatchAgentTool.execute(
          {task: 't', workingDirectory: sibling},
          context,
        );

        expect(result.status).toBe('failure');
        expect(result.content).toContain(
          `is outside the parent agent's working directory`,
        );
      } finally {
        await fs.rm(sibling, {recursive: true, force: true});
      }
    });
  });
});
