import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {SubAgentType} from '@omnicraft/api-schema';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import type {Agent} from '@/agent-core/agent/index.js';
import {agentPersistence} from '@/agent-core/agent/index.js';
import {toolResultBlocksToText} from '@/agent-core/llm-api/tool-result-block.js';
import {createMockContext} from '@/agent-core/tool/testing.js';
import type {ToolExecutionContext} from '@/agent-core/tool/types.js';

import {listResumableAgentsTool} from './list-resumable-agents-tool.js';
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

describe('listResumableAgentsTool', () => {
  let tmpDir: string;
  let context: ToolExecutionContext;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'list-resumable-agents-test-'),
    );
    context = createMockContext({
      sessionsDir: tmpDir,
      workingDirectory: '/workspace/project',
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  it('has the correct resumable name', () => {
    expect(listResumableAgentsTool.name).toBe('list_resumable_agents');
  });

  it('is registered by the subagent tool registry', () => {
    const registry = new SubAgentToolRegistry();

    expect(registry.get('list_resumable_agents')).toBe(listResumableAgentsTool);
    expect(registry.get('list_agents')).toBeUndefined();
  });

  it('returns an empty list when no resumable subagents are registered', async () => {
    const result = await listResumableAgentsTool.execute({}, context);

    expect(result).toMatchObject({
      status: 'success',
      data: {agents: []},
    });
    expect(toolResultBlocksToText(result.content)).toContain(
      'No subagents are available to resume',
    );
  });

  it('lists resumable subagents from the registry', async () => {
    const general = createMockAgent({title: 'Build Summary'});
    const explore = createMockAgent({
      title: 'Explore Report',
      isRunning: true,
    });
    context.subagentRegistry.register(
      general,
      SubAgentType.GENERAL,
      'crimson-otter',
      'none',
    );
    context.subagentRegistry.register(
      explore,
      SubAgentType.EXPLORE,
      'silver-wren',
      'none',
    );

    const result = await listResumableAgentsTool.execute({}, context);

    expect(result).toMatchObject({
      status: 'success',
      data: {
        agents: [
          {
            id: general.id,
            agentType: SubAgentType.GENERAL,
            title: 'Build Summary',
            nickname: 'crimson-otter',
            isRunning: false,
          },
          {
            id: explore.id,
            agentType: SubAgentType.EXPLORE,
            title: 'Explore Report',
            nickname: 'silver-wren',
            isRunning: true,
          },
        ],
      },
    });
    expect(toolResultBlocksToText(result.content)).toContain('crimson-otter');
    expect(toolResultBlocksToText(result.content)).toContain('Build Summary');
    expect(toolResultBlocksToText(result.content)).toContain('idle');
    expect(toolResultBlocksToText(result.content)).toContain('silver-wren');
    expect(toolResultBlocksToText(result.content)).toContain('Explore Report');
    expect(toolResultBlocksToText(result.content)).toContain('running');
  });

  it('does not read persisted metadata or snapshots', async () => {
    const metadataSpy = vi.spyOn(agentPersistence, 'metadataPath');
    const snapshotSpy = vi.spyOn(agentPersistence, 'loadSnapshot');
    const agent = createMockAgent({title: 'Live Title'});
    context.subagentRegistry.register(
      agent,
      SubAgentType.GENERAL,
      'crimson-otter',
      'none',
    );

    const result = await listResumableAgentsTool.execute({}, context);

    expect(result).toMatchObject({
      status: 'success',
      data: {
        agents: [
          {
            id: agent.id,
            agentType: SubAgentType.GENERAL,
            title: 'Live Title',
            nickname: 'crimson-otter',
            isRunning: false,
          },
        ],
      },
    });
    expect(metadataSpy).not.toHaveBeenCalled();
    expect(snapshotSpy).not.toHaveBeenCalled();
  });
});
