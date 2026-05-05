import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {ExploreSubAgent, GeneralSubAgent} from '@/agent/agents/index.js';
import {CoreSkillRegistry} from '@/agent/skills/index.js';
import {
  BashToolRegistry,
  CoreToolRegistry,
  FileToolRegistry,
  WebToolRegistry,
} from '@/agent/tools/index.js';
import type {AgentSnapshot} from '@/agent-core/agent/index.js';
import {createMockContext} from '@/agent-core/tool/testing.js';
import type {ToolExecutionContext} from '@/agent-core/tool/types.js';

import {
  createFreshSubagent,
  createSubAgent,
  dispatchAgentTool,
  getSubagentSessionsDir,
} from './dispatch-agent-tool.js';
import {loadSubagentMetadata} from './subagent-history.js';
import {SUB_AGENT_TYPE} from './subagent-types.js';

function resetAgentRegistries(): void {
  CoreToolRegistry.resetInstance();
  FileToolRegistry.resetInstance();
  WebToolRegistry.resetInstance();
  BashToolRegistry.resetInstance();
  CoreSkillRegistry.resetInstance();
}

function initAgentRegistries(): void {
  CoreToolRegistry.create();
  FileToolRegistry.create();
  WebToolRegistry.create();
  BashToolRegistry.create();
  CoreSkillRegistry.create();
}

function emptyUsage() {
  return {
    currentContextInputTokens: 0,
    latestCallOutputTokens: 0,
    sessionInputTokens: 0,
    sessionOutputTokens: 0,
    sessionCacheReadInputTokens: 0,
  };
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
      agentType: SUB_AGENT_TYPE.EXPLORE,
    });

    expect(result.success).toBe(true);
  });

  it('documents general and explore agent types', () => {
    expect(dispatchAgentTool.description).toContain(
      `- ${SUB_AGENT_TYPE.GENERAL} (General):`,
    );
    expect(dispatchAgentTool.description).toContain(
      `- ${SUB_AGENT_TYPE.EXPLORE} (Explore):`,
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

  it('documents explore-specific research use cases', () => {
    expect(dispatchAgentTool.description).toContain(
      `- ${SUB_AGENT_TYPE.EXPLORE} (Explore):`,
    );
    expect(dispatchAgentTool.description).toContain('architecture');
    expect(dispatchAgentTool.description).toContain('data flow');
    expect(dispatchAgentTool.description).toContain('impact analysis');
    expect(dispatchAgentTool.description).toContain(
      'Do not specify a report format unless the user asked for one',
    );
  });

  it('creates a general subagent by default', () => {
    resetAgentRegistries();
    initAgentRegistries();
    try {
      const subagent = createSubAgent(
        SUB_AGENT_TYPE.GENERAL,
        context.getConfig,
        tmpDir,
        'none',
      );

      expect(subagent).toBeInstanceOf(GeneralSubAgent);
    } finally {
      resetAgentRegistries();
    }
  });

  it('creates an explore subagent for explore tasks', () => {
    resetAgentRegistries();
    initAgentRegistries();
    try {
      const subagent = createSubAgent(
        SUB_AGENT_TYPE.EXPLORE,
        context.getConfig,
        tmpDir,
        'none',
      );

      expect(subagent).toBeInstanceOf(ExploreSubAgent);
    } finally {
      resetAgentRegistries();
    }
  });

  it('creates a general subagent from a provided snapshot', () => {
    resetAgentRegistries();
    initAgentRegistries();
    try {
      const snapshot: AgentSnapshot = {
        id: 'restored-general-id',
        title: 'Restored General',
        sseEventCount: 0,
        llmSession: {id: 'restored-llm-id', messages: []},
        options: {workingDirectory: tmpDir, thinkingLevel: 'none'},
      };

      const subagent = createSubAgent(
        SUB_AGENT_TYPE.GENERAL,
        context.getConfig,
        tmpDir,
        'none',
        undefined,
        snapshot,
      );

      expect(subagent).toBeInstanceOf(GeneralSubAgent);
      expect(subagent.id).toBe('restored-general-id');
    } finally {
      resetAgentRegistries();
    }
  });

  it('creates an explore subagent from a provided snapshot', () => {
    resetAgentRegistries();
    initAgentRegistries();
    try {
      const snapshot: AgentSnapshot = {
        id: 'restored-explore-id',
        title: 'Restored Explore',
        sseEventCount: 0,
        llmSession: {id: 'restored-llm-id', messages: []},
        options: {workingDirectory: tmpDir, thinkingLevel: 'none'},
      };

      const subagent = createSubAgent(
        SUB_AGENT_TYPE.EXPLORE,
        context.getConfig,
        tmpDir,
        'none',
        undefined,
        snapshot,
      );

      expect(subagent).toBeInstanceOf(ExploreSubAgent);
      expect(subagent.id).toBe('restored-explore-id');
    } finally {
      resetAgentRegistries();
    }
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
    resetAgentRegistries();
    initAgentRegistries();
    try {
      const sessionsDir = path.join(tmpDir, 'subagents');
      const subagent = createSubAgent(
        SUB_AGENT_TYPE.GENERAL,
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
          usageBaselineMessageCount: null,
          usage: emptyUsage(),
        },
        options: {workingDirectory: tmpDir, thinkingLevel: 'none'},
      });
      expect(metadata).toEqual({
        id: subagent.id,
        title: 'New Session',
        workingDirectory: tmpDir,
      });
    } finally {
      resetAgentRegistries();
    }
  });

  it('persists an explore subagent when sessionsDir is provided', async () => {
    resetAgentRegistries();
    initAgentRegistries();
    try {
      const sessionsDir = path.join(tmpDir, 'subagents');
      const subagent = createSubAgent(
        SUB_AGENT_TYPE.EXPLORE,
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
          usageBaselineMessageCount: null,
          usage: emptyUsage(),
        },
        options: {workingDirectory: tmpDir, thinkingLevel: 'none'},
      });
      expect(metadata).toEqual({
        id: subagent.id,
        title: 'New Session',
        workingDirectory: tmpDir,
      });
    } finally {
      resetAgentRegistries();
    }
  });

  it('fresh dispatch creation persists subagent sidecar metadata before running', async () => {
    resetAgentRegistries();
    initAgentRegistries();
    try {
      const sessionsDir = path.join(tmpDir, 'subagents');
      const subagent = await createFreshSubagent({
        agentType: SUB_AGENT_TYPE.EXPLORE,
        getConfig: context.getConfig,
        workingDirectory: tmpDir,
        thinkingLevel: 'none',
        subagentSessionsDir: sessionsDir,
      });

      await expect(
        loadSubagentMetadata(sessionsDir, subagent.id),
      ).resolves.toMatchObject({
        schemaVersion: 1,
        id: subagent.id,
        agentType: SUB_AGENT_TYPE.EXPLORE,
      });
    } finally {
      resetAgentRegistries();
    }
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
