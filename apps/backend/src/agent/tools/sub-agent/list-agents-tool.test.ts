import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {SubAgentType} from '@omnicraft/api-schema';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {Agent} from '@/agent-core/agent/index.js';
import {createMockContext} from '@/agent-core/tool/testing.js';
import type {ToolExecutionContext} from '@/agent-core/tool/types.js';

import {listAgentsTool} from './list-agents-tool.js';
import {SubAgentToolRegistry} from './sub-agent-tool-registry.js';

const parentId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const child1Id = '11111111-1111-4111-8111-111111111111';
const child2Id = '22222222-2222-4222-8222-222222222222';
const unregisteredChildId = '33333333-3333-4333-8333-333333333333';

function emptyUsage() {
  return {
    currentContextInputTokens: 0,
    latestCallOutputTokens: 0,
    sessionInputTokens: 0,
    sessionOutputTokens: 0,
    sessionCacheReadInputTokens: 0,
  };
}

async function writeSubagentMetadata(
  rootDir: string,
  id: string,
  title: string,
): Promise<void> {
  const dir = path.join(rootDir, id);
  await fs.mkdir(dir, {recursive: true});
  await fs.writeFile(
    path.join(dir, 'metadata.json'),
    JSON.stringify({id, title, workingDirectory: '/workspace/project'}),
  );
}

async function writeSubagentSnapshot(
  rootDir: string,
  id: string,
  title: string,
): Promise<void> {
  const dir = path.join(rootDir, id);
  await fs.mkdir(dir, {recursive: true});
  await fs.writeFile(
    path.join(dir, 'snapshot.json'),
    JSON.stringify({
      id,
      title,
      sseEventCount: 0,
      llmSession: {
        id: 'llm-session-id',
        messages: [],
        compactions: [],
        latestUsageInputMessageCount: null,
        usage: emptyUsage(),
      },
      options: {
        workingDirectory: '/workspace/project',
        thinkingLevel: 'none',
      },
      subagents: [],
    }),
  );
}

describe('listAgentsTool', () => {
  let tmpDir: string;
  let context: ToolExecutionContext;
  let subagentSessionsDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'list-agents-test-'));
    context = createMockContext({
      agentId: parentId,
      sessionsDir: tmpDir,
      workingDirectory: '/workspace/project',
    });
    subagentSessionsDir = path.join(tmpDir, parentId, 'subagents');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  it('has the correct name', () => {
    expect(listAgentsTool.name).toBe('list_agents');
  });

  it('is registered by the subagent tool registry', () => {
    SubAgentToolRegistry.resetInstance();
    try {
      const registry = SubAgentToolRegistry.create();

      expect(registry.get('list_agents')).toBe(listAgentsTool);
    } finally {
      SubAgentToolRegistry.resetInstance();
    }
  });

  it('returns an empty list when no subagents are registered', async () => {
    const result = await listAgentsTool.execute({}, context);

    expect(result).toMatchObject({
      status: 'success',
      data: {agents: []},
    });
    expect(result.content).toContain('No subagents');
  });

  it('lists registered subagents with titles from metadata', async () => {
    context.subagentRegistry.register({
      id: child1Id,
      agentType: SubAgentType.GENERAL,
    });
    context.subagentRegistry.register({
      id: child2Id,
      agentType: SubAgentType.EXPLORE,
    });
    await writeSubagentMetadata(subagentSessionsDir, child1Id, 'Build Summary');
    await writeSubagentMetadata(
      subagentSessionsDir,
      child2Id,
      'Explore Report',
    );
    await writeSubagentMetadata(
      subagentSessionsDir,
      unregisteredChildId,
      'Not Owned By Registry',
    );

    const result = await listAgentsTool.execute({}, context);

    expect(result).toMatchObject({
      status: 'success',
      data: {
        agents: [
          {
            id: child1Id,
            agentType: SubAgentType.GENERAL,
            title: 'Build Summary',
          },
          {
            id: child2Id,
            agentType: SubAgentType.EXPLORE,
            title: 'Explore Report',
          },
        ],
      },
    });
    expect(result.content).toContain(child1Id);
    expect(result.content).toContain('Build Summary');
    expect(result.content).not.toContain(unregisteredChildId);
  });

  it('falls back to snapshot title when metadata is missing', async () => {
    context.subagentRegistry.register({
      id: child1Id,
      agentType: SubAgentType.GENERAL,
    });
    await writeSubagentSnapshot(
      subagentSessionsDir,
      child1Id,
      'Snapshot Title',
    );

    const result = await listAgentsTool.execute({}, context);

    expect(result).toMatchObject({
      status: 'success',
      data: {
        agents: [
          {
            id: child1Id,
            agentType: SubAgentType.GENERAL,
            title: 'Snapshot Title',
          },
        ],
      },
    });
  });

  it('uses the default title when persisted title cannot be read', async () => {
    context.subagentRegistry.register({
      id: child1Id,
      agentType: SubAgentType.GENERAL,
    });

    const result = await listAgentsTool.execute({}, context);

    expect(result).toMatchObject({
      status: 'success',
      data: {
        agents: [
          {
            id: child1Id,
            agentType: SubAgentType.GENERAL,
            title: Agent.DEFAULT_TITLE,
          },
        ],
      },
    });
  });

  it('uses the default title for in-memory parent sessions', async () => {
    const memoryContext = createMockContext({sessionsDir: null});
    memoryContext.subagentRegistry.register({
      id: child1Id,
      agentType: SubAgentType.GENERAL,
    });

    const result = await listAgentsTool.execute({}, memoryContext);

    expect(result).toMatchObject({
      status: 'success',
      data: {
        agents: [
          {
            id: child1Id,
            agentType: SubAgentType.GENERAL,
            title: Agent.DEFAULT_TITLE,
          },
        ],
      },
    });
  });
});
