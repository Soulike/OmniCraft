import {describe, expect, it, vi} from 'vitest';

import type {AgentSnapshot} from '@/agent-core/agent/index.js';
import {createMockContext} from '@/agent-core/tool/testing.js';

import {
  createResumeSubagentTool,
  resumeSubagentTool,
} from './resume-subagent-tool.js';
import {SubAgentToolRegistry} from './sub-agent-tool-registry.js';
import {SUB_AGENT_TYPE} from './subagent-types.js';

function emptyUsage() {
  return {
    currentContextInputTokens: 0,
    latestCallOutputTokens: 0,
    sessionInputTokens: 0,
    sessionOutputTokens: 0,
    sessionCacheReadInputTokens: 0,
  };
}

describe('resumeSubagentTool.execute', () => {
  it('returns failure without persisted parent sessionsDir and does not prepare resume state', async () => {
    const {deps, tool} = createTestTool();

    const result = await tool.execute(
      {subagentId: 'source-subagent-id', task: 'continue'},
      createMockContext({sessionsDir: null}),
    );

    const message =
      'Cannot resume subagent because persisted history is unavailable.';
    expect(result).toEqual({
      data: {message},
      content: `Error: ${message}`,
      status: 'failure',
    });
    expect(deps.prepareResumedSubagentState).not.toHaveBeenCalled();
  });

  it('uses prepared metadata and snapshot when running the resumed turn', async () => {
    const snapshot = createPreparedSnapshot({
      id: 'prepared-subagent-id',
      options: {workingDirectory: '/prepared-work', thinkingLevel: 'high'},
    });
    const subagent = {id: 'prepared-subagent-id'};
    const {deps, tool} = createTestTool();
    deps.createSubAgent.mockReturnValue(subagent);
    deps.prepareResumedSubagentState.mockResolvedValue({
      snapshot,
      metadata: {
        schemaVersion: 1,
        id: 'prepared-subagent-id',
        agentType: SUB_AGENT_TYPE.EXPLORE,
        createdAt: 123,
        resumedFromSubagentId: 'source-subagent-id',
      },
      subagentSseEventStartIndex: 17,
    });
    deps.runSubagentTurn.mockResolvedValue({
      data: {
        subagentId: 'prepared-subagent-id',
        agentType: SUB_AGENT_TYPE.EXPLORE,
        summary: 'continued',
      },
      content: 'Subagent completed.',
      status: 'success',
    });
    const context = createMockContext({
      agentId: 'parent-agent-id',
      sessionsDir: '/parent-sessions',
      workingDirectory: '/parent-work',
    });

    const result = await tool.execute(
      {
        subagentId: 'source-subagent-id',
        task: 'continue investigation',
        model: 'light',
      },
      context,
    );

    expect(result.status).toBe('success');
    expect(deps.prepareResumedSubagentState).toHaveBeenCalledWith({
      subagentSessionsDir: '/mock-subagent-sessions',
      sourceSubagentId: 'source-subagent-id',
    });
    expect(deps.createSubAgent).toHaveBeenCalledWith(
      SUB_AGENT_TYPE.EXPLORE,
      context.getLightConfig,
      '/prepared-work',
      'high',
      '/mock-subagent-sessions',
      snapshot,
    );
    expect(deps.runSubagentTurn).toHaveBeenCalledWith({
      subagent,
      task: 'continue investigation',
      agentType: SUB_AGENT_TYPE.EXPLORE,
      thinkingLevel: 'high',
      workingDirectory: '/prepared-work',
      context,
      subagentSseEventStartIndex: 17,
    });
  });

  it('uses the parent config by default', async () => {
    const snapshot = createPreparedSnapshot();
    const subagent = {id: 'prepared-subagent-id'};
    const {deps, tool} = createTestTool();
    deps.createSubAgent.mockReturnValue(subagent);
    deps.prepareResumedSubagentState.mockResolvedValue({
      snapshot,
      metadata: {
        schemaVersion: 1,
        id: 'prepared-subagent-id',
        agentType: SUB_AGENT_TYPE.GENERAL,
        createdAt: 123,
      },
      subagentSseEventStartIndex: 17,
    });
    deps.runSubagentTurn.mockResolvedValue({
      data: {
        subagentId: 'prepared-subagent-id',
        agentType: SUB_AGENT_TYPE.GENERAL,
        summary: 'continued',
      },
      content: 'Subagent completed.',
      status: 'success',
    });
    const context = createMockContext({sessionsDir: '/parent-sessions'});

    await tool.execute(
      {subagentId: 'source-subagent-id', task: 'continue investigation'},
      context,
    );

    expect(deps.createSubAgent).toHaveBeenCalledWith(
      SUB_AGENT_TYPE.GENERAL,
      context.getConfig,
      '/prepared-work',
      'medium',
      '/mock-subagent-sessions',
      snapshot,
    );
  });

  it('includes the prepared resumed subagent id when a post-prepare failure occurs', async () => {
    const snapshot = createPreparedSnapshot({id: 'prepared-subagent-id'});
    const {deps, tool} = createTestTool();
    deps.createSubAgent.mockImplementation(() => {
      throw new Error('restore failed');
    });
    deps.prepareResumedSubagentState.mockResolvedValue({
      snapshot,
      metadata: {
        schemaVersion: 1,
        id: 'prepared-subagent-id',
        agentType: SUB_AGENT_TYPE.GENERAL,
        createdAt: 123,
      },
      subagentSseEventStartIndex: 3,
    });

    const result = await tool.execute(
      {subagentId: 'source-subagent-id', task: 'continue investigation'},
      createMockContext({sessionsDir: '/parent-sessions'}),
    );

    expect(result).toEqual({
      data: {
        message:
          'Resume subagent error for prepared subagent prepared-subagent-id: restore failed',
      },
      content:
        'Error: Resume subagent error for prepared subagent prepared-subagent-id: restore failed',
      status: 'failure',
    });
  });
});

describe('resumeSubagentTool', () => {
  it('has the correct name', () => {
    expect(resumeSubagentTool.name).toBe('resume_subagent');
  });

  it('requires subagentId and task but not agentType', () => {
    expect(
      resumeSubagentTool.parameters.safeParse({
        subagentId: 'subagent-1',
        task: 'continue the previous investigation',
      }).success,
    ).toBe(true);

    expect(
      resumeSubagentTool.parameters.safeParse({
        subagentId: 'subagent-1',
        task: 'continue the previous investigation',
        agentType: 'explore',
      }).success,
    ).toBe(false);
  });

  it('is registered in the subagent tool registry', () => {
    SubAgentToolRegistry.resetInstance();
    try {
      const registry = SubAgentToolRegistry.create();

      expect(registry.get('resume_subagent')).toBe(resumeSubagentTool);
    } finally {
      SubAgentToolRegistry.resetInstance();
    }
  });
});

function createPreparedSnapshot(
  overrides: Partial<AgentSnapshot> = {},
): AgentSnapshot {
  return {
    id: 'prepared-subagent-id',
    title: 'Prepared Subagent',
    sseEventCount: 17,
    llmSession: {
      id: 'prepared-llm-id',
      messages: [],
      compactions: [],
      usageBaselineMessageCount: null,
      usage: emptyUsage(),
    },
    options: {workingDirectory: '/prepared-work', thinkingLevel: 'medium'},
    ...overrides,
  };
}

function createTestTool() {
  const deps = {
    createSubAgent: vi.fn(),
    getSubagentSessionsDir: vi.fn((context: {sessionsDir?: string | null}) => {
      if (!context.sessionsDir) return undefined;
      return '/mock-subagent-sessions';
    }),
    prepareResumedSubagentState: vi.fn(),
    runSubagentTurn: vi.fn(),
  };

  return {deps, tool: createResumeSubagentTool(deps)};
}
