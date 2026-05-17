import crypto from 'node:crypto';

import {SubAgentType} from '@omnicraft/api-schema';
import {describe, expect, it} from 'vitest';

import type {Agent} from '../agent.js';
import {
  DEFAULT_MAX_LIVE_SUBAGENTS,
  SubagentRegistry,
} from './subagent-registry.js';

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

describe('SubagentRegistry', () => {
  it('starts empty by default', () => {
    const registry = new SubagentRegistry();

    expect(registry.list()).toEqual([]);
  });

  it('uses ten entries as the default live limit', () => {
    expect(DEFAULT_MAX_LIVE_SUBAGENTS).toBe(10);
  });

  it('registers and returns a live subagent handle', () => {
    const registry = new SubagentRegistry();
    const agent = createMockAgent({title: 'Build Summary'});

    registry.register(agent, SubAgentType.GENERAL);

    expect(registry.get(agent.id)).toEqual({
      agent,
      agentType: SubAgentType.GENERAL,
    });
  });

  it('lists live records from the current agent instance', () => {
    const registry = new SubagentRegistry();
    const idle = createMockAgent({title: 'Build Summary'});
    const running = createMockAgent({title: 'Explore Report', isRunning: true});

    registry.register(idle, SubAgentType.GENERAL);
    registry.register(running, SubAgentType.EXPLORE);

    expect(registry.list()).toEqual([
      {
        id: idle.id,
        agentType: SubAgentType.GENERAL,
        title: 'Build Summary',
        isRunning: false,
      },
      {
        id: running.id,
        agentType: SubAgentType.EXPLORE,
        title: 'Explore Report',
        isRunning: true,
      },
    ]);
  });

  it('updates an existing live entry', () => {
    const registry = new SubagentRegistry();
    const first = createMockAgent();
    const replacement = createMockAgent({id: first.id, title: 'Replacement'});

    registry.register(first, SubAgentType.GENERAL);
    registry.register(replacement, SubAgentType.EXPLORE);

    expect(registry.get(first.id)).toEqual({
      agent: replacement,
      agentType: SubAgentType.EXPLORE,
    });
    expect(registry.list()).toEqual([
      {
        id: first.id,
        agentType: SubAgentType.EXPLORE,
        title: 'Replacement',
        isRunning: false,
      },
    ]);
  });

  it('rejects non-UUID ids during lookup', () => {
    const registry = new SubagentRegistry();

    expect(() => registry.get('not-a-uuid')).toThrow();
  });

  it('evicts the least recently used idle entry when capacity is exceeded', () => {
    const registry = new SubagentRegistry({maxEntries: 2});
    const first = createMockAgent({title: 'First'});
    const second = createMockAgent({title: 'Second'});
    const third = createMockAgent({title: 'Third'});

    registry.register(first, SubAgentType.GENERAL);
    registry.register(second, SubAgentType.EXPLORE);
    registry.get(first.id);
    registry.register(third, SubAgentType.GENERAL);

    expect(registry.get(first.id)?.agent).toBe(first);
    expect(registry.get(second.id)).toBeUndefined();
    expect(registry.get(third.id)?.agent).toBe(third);
  });

  it('evicts idle entries before running entries', () => {
    const registry = new SubagentRegistry({maxEntries: 1});
    const running = createMockAgent({isRunning: true});
    const idle = createMockAgent();

    registry.register(running, SubAgentType.GENERAL);
    registry.register(idle, SubAgentType.EXPLORE);

    expect(registry.get(running.id)?.agent).toBe(running);
    expect(registry.get(idle.id)).toBeUndefined();
  });

  it('evicts idle entries before entries with active SSE readers', () => {
    const registry = new SubagentRegistry({maxEntries: 1});
    const reading = createMockAgent({activeReaderCount: 1});
    const idle = createMockAgent();

    registry.register(reading, SubAgentType.GENERAL);
    registry.register(idle, SubAgentType.EXPLORE);

    expect(registry.get(reading.id)?.agent).toBe(reading);
    expect(registry.get(idle.id)).toBeUndefined();
  });

  it('keeps protected entries when there are no evictable entries', () => {
    const registry = new SubagentRegistry({maxEntries: 1});
    const running = createMockAgent({isRunning: true});
    const reading = createMockAgent({activeReaderCount: 1});

    registry.register(running, SubAgentType.GENERAL);
    registry.register(reading, SubAgentType.EXPLORE);

    expect(registry.get(running.id)?.agent).toBe(running);
    expect(registry.get(reading.id)?.agent).toBe(reading);
  });

  it('runs eviction on a valid missing lookup', () => {
    const registry = new SubagentRegistry({maxEntries: 1});
    const firstOverrides = {title: 'First', isRunning: true};
    const first = createMockAgent(firstOverrides);
    const second = createMockAgent({title: 'Second', activeReaderCount: 1});

    registry.register(first, SubAgentType.GENERAL);
    registry.register(second, SubAgentType.EXPLORE);
    firstOverrides.isRunning = false;

    expect(registry.get(crypto.randomUUID())).toBeUndefined();

    expect(registry.get(first.id)).toBeUndefined();
    expect(registry.get(second.id)?.agent).toBe(second);
  });

  it('runs eviction before listing live records', () => {
    const registry = new SubagentRegistry({maxEntries: 1});
    const firstOverrides = {title: 'First', isRunning: true};
    const first = createMockAgent(firstOverrides);
    const second = createMockAgent({title: 'Second', activeReaderCount: 1});

    registry.register(first, SubAgentType.GENERAL);
    registry.register(second, SubAgentType.EXPLORE);
    firstOverrides.isRunning = false;

    expect(registry.list()).toEqual([
      {
        id: second.id,
        agentType: SubAgentType.EXPLORE,
        title: 'Second',
        isRunning: false,
      },
    ]);
  });

  it('evicts multiple least recently accessed entries before listing', () => {
    const registry = new SubagentRegistry({maxEntries: 2});
    const first = createMockAgent({title: 'First', activeReaderCount: 1});
    const second = createMockAgent({title: 'Second', activeReaderCount: 1});
    const third = createMockAgent({title: 'Third', activeReaderCount: 1});
    const fourth = createMockAgent({title: 'Fourth', activeReaderCount: 1});

    registry.register(first, SubAgentType.GENERAL);
    registry.register(second, SubAgentType.EXPLORE);
    registry.register(third, SubAgentType.GENERAL);
    registry.register(fourth, SubAgentType.EXPLORE);
    first.sseLog.activeReaderCount = 0;
    second.sseLog.activeReaderCount = 0;
    third.sseLog.activeReaderCount = 0;

    expect(registry.list()).toEqual([
      {
        id: third.id,
        agentType: SubAgentType.GENERAL,
        title: 'Third',
        isRunning: false,
      },
      {
        id: fourth.id,
        agentType: SubAgentType.EXPLORE,
        title: 'Fourth',
        isRunning: false,
      },
    ]);
  });

  it('clears live entries', () => {
    const registry = new SubagentRegistry();
    const agent = createMockAgent();

    registry.register(agent, SubAgentType.GENERAL);
    registry.clear();

    expect(registry.list()).toEqual([]);
    expect(registry.get(agent.id)).toBeUndefined();
  });
});
