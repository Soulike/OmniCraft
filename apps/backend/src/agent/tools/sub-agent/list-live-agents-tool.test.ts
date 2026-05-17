import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {SubAgentType} from '@omnicraft/api-schema';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import type {Agent} from '@/agent-core/agent/index.js';
import {agentPersistence} from '@/agent-core/agent/index.js';
import {createMockContext} from '@/agent-core/tool/testing.js';
import type {ToolExecutionContext} from '@/agent-core/tool/types.js';

import {listLiveAgentsTool} from './list-live-agents-tool.js';
import {SubAgentToolRegistry} from './sub-agent-tool-registry.js';

function createMockAgent(
  overrides: {
    id?: string;
    title?: string;
    isRunning?: boolean;
    activeReaderCount?: number;
  } = {},
): Agent {
  const agent = {
    id: overrides.id ?? crypto.randomUUID(),
    title: overrides.title ?? 'New Session',
    sseLog: {
      activeReaderCount: overrides.activeReaderCount ?? 0,
    },
  } as Agent;

  Object.defineProperty(agent, 'isRunning', {
    get: () => overrides.isRunning ?? false,
  });

  return agent;
}

describe('listLiveAgentsTool', () => {
  let tmpDir: string;
  let context: ToolExecutionContext;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'list-live-agents-test-'));
    context = createMockContext({
      sessionsDir: tmpDir,
      workingDirectory: '/workspace/project',
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  it('has the correct live-only name', () => {
    expect(listLiveAgentsTool.name).toBe('list_live_agents');
  });

  it('is registered by the subagent tool registry', () => {
    SubAgentToolRegistry.resetInstance();
    try {
      const registry = SubAgentToolRegistry.create();
      const oldToolName = ['list', 'agents'].join('_');

      expect(registry.get('list_live_agents')).toBe(listLiveAgentsTool);
      expect(registry.get(oldToolName)).toBeUndefined();
    } finally {
      SubAgentToolRegistry.resetInstance();
    }
  });

  it('returns an empty list when no live subagents are registered', async () => {
    const result = await listLiveAgentsTool.execute({}, context);

    expect(result).toMatchObject({
      status: 'success',
      data: {agents: []},
    });
    expect(result.content).toContain('No live subagents');
  });

  it('lists live subagents from the registry', async () => {
    const general = createMockAgent({title: 'Build Summary'});
    const explore = createMockAgent({
      title: 'Explore Report',
      isRunning: true,
    });
    context.subagentRegistry.register(general, SubAgentType.GENERAL);
    context.subagentRegistry.register(explore, SubAgentType.EXPLORE);

    const result = await listLiveAgentsTool.execute({}, context);

    expect(result).toMatchObject({
      status: 'success',
      data: {
        agents: [
          {
            id: general.id,
            agentType: SubAgentType.GENERAL,
            title: 'Build Summary',
            isRunning: false,
          },
          {
            id: explore.id,
            agentType: SubAgentType.EXPLORE,
            title: 'Explore Report',
            isRunning: true,
          },
        ],
      },
    });
    expect(result.content).toContain(general.id);
    expect(result.content).toContain('Build Summary');
    expect(result.content).toContain('idle');
    expect(result.content).toContain(explore.id);
    expect(result.content).toContain('Explore Report');
    expect(result.content).toContain('running');
  });

  it('does not read persisted metadata or snapshots', async () => {
    const metadataSpy = vi.spyOn(agentPersistence, 'metadataPath');
    const snapshotSpy = vi.spyOn(agentPersistence, 'loadSnapshot');
    const agent = createMockAgent({title: 'Live Title'});
    context.subagentRegistry.register(agent, SubAgentType.GENERAL);

    const result = await listLiveAgentsTool.execute({}, context);

    expect(result).toMatchObject({
      status: 'success',
      data: {
        agents: [
          {
            id: agent.id,
            agentType: SubAgentType.GENERAL,
            title: 'Live Title',
            isRunning: false,
          },
        ],
      },
    });
    expect(metadataSpy).not.toHaveBeenCalled();
    expect(snapshotSpy).not.toHaveBeenCalled();
  });
});
