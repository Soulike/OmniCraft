import crypto from 'node:crypto';

import {SubAgentType} from '@omnicraft/api-schema';
import {describe, expect, it, vi} from 'vitest';

import type {Agent} from '@/agent-core/agent/index.js';
import {createMockContext} from '@/agent-core/tool/testing.js';
import type {ToolExecutionContext} from '@/agent-core/tool/types.js';

import {resumeAgentTool} from './resume-agent-tool.js';
import {SubAgentToolRegistry} from './sub-agent-tool-registry.js';

function createMockSubagent(
  overrides: {
    id?: string;
    isRunning?: boolean;
    output?: string;
  } = {},
): Agent & {handledMessages: string[]} {
  const handledMessages: string[] = [];
  const agentId = overrides.id ?? crypto.randomUUID();
  const subagent = {
    id: agentId,
    title: 'Reusable Subagent',
    sseLog: {activeReaderCount: 0},
    handledMessages,
    tryStartUserTurn(message: string) {
      if (overrides.isRunning ?? false) return false;
      handledMessages.push(message);
      return true;
    },
    abort: vi.fn(),
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
      yield {
        nextIndex: 2,
        event: {type: 'text-delta', content: overrides.output ?? 'resumed'},
      };
      yield {nextIndex: 3, event: {type: 'done', reason: 'complete'}};
    },
    getWorkingDirectory() {
      return '/workspace/project';
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
  } as unknown as Agent & {handledMessages: string[]};

  Object.defineProperty(subagent, 'isRunning', {
    get: () => overrides.isRunning ?? false,
  });
  return subagent;
}

function createContextWithEvents(): ToolExecutionContext & {events: unknown[]} {
  const events: unknown[] = [];
  const context = createMockContext({
    onSubAgentEvent: (event) => {
      events.push(event);
    },
  });
  return Object.assign(context, {events});
}

describe('resumeAgentTool', () => {
  it('has the correct name', () => {
    expect(resumeAgentTool.name).toBe('resume_agent');
  });

  it('documents that the result includes the subagent name', () => {
    expect(resumeAgentTool.description).toContain('includes the subagent name');
  });

  it('is registered by the subagent tool registry', () => {
    const registry = new SubAgentToolRegistry();

    expect(registry.get('resume_agent')).toBe(resumeAgentTool);
  });

  it('returns a normal failure for unknown names', async () => {
    const context = createMockContext();
    const result = await resumeAgentTool.execute(
      {name: 'no-such-name', task: 'Continue'},
      context,
    );

    expect(result.status).toBe('failure');
    expect(result.content).toContain('not available to resume');
  });

  it('returns a busy failure for running subagents', async () => {
    const context = createMockContext();
    const subagent = createMockSubagent({isRunning: true});
    context.subagentRegistry.register(
      subagent,
      SubAgentType.GENERAL,
      'crimson-otter',
    );

    const result = await resumeAgentTool.execute(
      {name: 'crimson-otter', task: 'Continue'},
      context,
    );

    expect(result.status).toBe('failure');
    expect(result.content).toContain('already running');
  });

  it('runs a follow-up turn on a registered idle subagent', async () => {
    const context = createContextWithEvents();
    const subagent = createMockSubagent({output: 'follow-up result'});
    context.subagentRegistry.register(
      subagent,
      SubAgentType.EXPLORE,
      'crimson-otter',
    );

    const result = await resumeAgentTool.execute(
      {name: 'crimson-otter', task: 'Continue analysis'},
      context,
    );

    expect(result).toMatchObject({
      status: 'success',
      data: {summary: 'follow-up result', agentId: subagent.id},
      content: `<subagent_name>crimson-otter</subagent_name>\n\nfollow-up result`,
    });
    expect(subagent.handledMessages).toEqual(['Continue analysis']);
    expect(context.events).toEqual([
      {
        type: 'subagent-resume',
        agentId: subagent.id,
        nickname: 'crimson-otter',
        task: 'Continue analysis',
        agentType: SubAgentType.EXPLORE,
        thinkingLevel: 'none',
        workingDirectory: '/workspace/project',
      },
      expect.objectContaining({type: 'subagent-output'}),
      expect.objectContaining({type: 'subagent-output'}),
      expect.objectContaining({type: 'subagent-output'}),
      {type: 'subagent-complete', agentId: subagent.id, status: 'success'},
    ]);
  });

  it('rejects a second resume once the first has claimed the subagent', async () => {
    let releaseBlocker!: () => void;
    const blocker = new Promise<void>((resolve) => {
      releaseBlocker = resolve;
    });
    const context = createMockContext();

    // Mock whose claim flips isRunning true on first start, so a concurrent
    // second resume observes a busy subagent — no module-level claim set.
    let running = false;
    const handledMessages: string[] = [];
    const agentId = crypto.randomUUID();
    const subagent = {
      id: agentId,
      title: 'Reusable Subagent',
      sseLog: {activeReaderCount: 0},
      handledMessages,
      tryStartUserTurn(message: string) {
        if (running) return false;
        running = true;
        handledMessages.push(message);
        return true;
      },
      abort: vi.fn(),
      async *subscribe() {
        await blocker;
        yield {nextIndex: 1, event: {type: 'done', reason: 'complete'}};
      },
      getWorkingDirectory() {
        return '/workspace/project';
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
    } as unknown as Agent & {handledMessages: string[]};
    Object.defineProperty(subagent, 'isRunning', {get: () => running});
    context.subagentRegistry.register(
      subagent,
      SubAgentType.GENERAL,
      'crimson-otter',
    );

    const first = resumeAgentTool.execute(
      {name: 'crimson-otter', task: 'First'},
      context,
    );
    await Promise.resolve();

    const second = await resumeAgentTool.execute(
      {name: 'crimson-otter', task: 'Second'},
      context,
    );

    releaseBlocker();
    await first;

    expect(second.status).toBe('failure');
    expect(second.content).toContain('already running');
    expect(handledMessages).toEqual(['First']);
  });
});
