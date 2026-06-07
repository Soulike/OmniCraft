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
    blockUntil?: Promise<void>;
  } = {},
): Agent & {handledMessages: string[]} {
  const handledMessages: string[] = [];
  const agentId = overrides.id ?? crypto.randomUUID();
  const subagent = {
    id: agentId,
    title: 'Reusable Subagent',
    sseLog: {activeReaderCount: 0},
    handledMessages,
    handleUserMessage(message: string) {
      handledMessages.push(message);
    },
    abort: vi.fn(),
    async *subscribe() {
      if (overrides.blockUntil) await overrides.blockUntil;
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

  it('is registered by the subagent tool registry', () => {
    SubAgentToolRegistry.resetInstance();
    try {
      const registry = SubAgentToolRegistry.create();
      expect(registry.get('resume_agent')).toBe(resumeAgentTool);
    } finally {
      SubAgentToolRegistry.resetInstance();
    }
  });

  it('returns a normal failure for malformed ids', async () => {
    const context = createMockContext();
    const result = await resumeAgentTool.execute(
      {agentId: 'not-a-uuid', task: 'Continue'},
      context,
    );

    expect(result.status).toBe('failure');
    expect(result.content).toContain('Invalid subagent id');
    expect(result.content).toContain('must be a UUID');
    expect(result.content).not.toContain(
      'expected a UUID from list_resumable_agents',
    );
  });

  it('returns a normal failure for unknown ids', async () => {
    const context = createMockContext();
    const result = await resumeAgentTool.execute(
      {agentId: crypto.randomUUID(), task: 'Continue'},
      context,
    );

    expect(result.status).toBe('failure');
    expect(result.content).toContain('not available to resume');
  });

  it('returns a busy failure for running subagents', async () => {
    const context = createMockContext();
    const subagent = createMockSubagent({isRunning: true});
    context.subagentRegistry.register(subagent, SubAgentType.GENERAL);

    const result = await resumeAgentTool.execute(
      {agentId: subagent.id, task: 'Continue'},
      context,
    );

    expect(result.status).toBe('failure');
    expect(result.content).toContain('already running');
  });

  it('runs a follow-up turn on a registered idle subagent', async () => {
    const context = createContextWithEvents();
    const subagent = createMockSubagent({output: 'follow-up result'});
    context.subagentRegistry.register(subagent, SubAgentType.EXPLORE);

    const result = await resumeAgentTool.execute(
      {agentId: subagent.id, task: 'Continue analysis'},
      context,
    );

    expect(result).toMatchObject({
      status: 'success',
      data: {summary: 'follow-up result'},
      content: 'follow-up result',
    });
    expect(subagent.handledMessages).toEqual(['Continue analysis']);
    expect(context.events).toEqual([
      {
        type: 'subagent-resume',
        agentId: subagent.id,
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

  it('rejects a second same-id resume while the first resume is claimed', async () => {
    let releaseBlocker!: () => void;
    const blocker = new Promise<void>((resolve) => {
      releaseBlocker = resolve;
    });
    const context = createMockContext();
    const subagent = createMockSubagent({blockUntil: blocker});
    context.subagentRegistry.register(subagent, SubAgentType.GENERAL);

    const first = resumeAgentTool.execute(
      {agentId: subagent.id, task: 'First'},
      context,
    );
    await Promise.resolve();

    const second = await resumeAgentTool.execute(
      {agentId: subagent.id, task: 'Second'},
      context,
    );

    releaseBlocker();
    await first;

    expect(second.status).toBe('failure');
    expect(second.content).toContain('already running');
    expect(subagent.handledMessages).toEqual(['First']);
  });
});
