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
    sseLog: {},
  } as Agent;

  Object.defineProperty(agent, 'isRunning', {
    get: () => overrides.isRunning ?? false,
  });
  Object.defineProperty(agent.sseLog, 'activeReaderCount', {
    get: () => overrides.activeReaderCount ?? 0,
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

    registry.register(agent, SubAgentType.GENERAL, 'crimson-otter');

    expect(registry.get(agent.id)).toEqual({
      agent,
      agentType: SubAgentType.GENERAL,
      nickname: 'crimson-otter',
    });
  });

  it('lists live records from the current agent instance', () => {
    const registry = new SubagentRegistry();
    const idle = createMockAgent({title: 'Build Summary'});
    const running = createMockAgent({title: 'Explore Report', isRunning: true});

    registry.register(idle, SubAgentType.GENERAL, 'crimson-otter');
    registry.register(running, SubAgentType.EXPLORE, 'silver-wren');

    expect(registry.list()).toEqual([
      {
        id: idle.id,
        agentType: SubAgentType.GENERAL,
        title: 'Build Summary',
        nickname: 'crimson-otter',
        isRunning: false,
      },
      {
        id: running.id,
        agentType: SubAgentType.EXPLORE,
        title: 'Explore Report',
        nickname: 'silver-wren',
        isRunning: true,
      },
    ]);
  });

  it('updates an existing live entry', () => {
    const registry = new SubagentRegistry();
    const first = createMockAgent();
    const replacement = createMockAgent({id: first.id, title: 'Replacement'});

    registry.register(first, SubAgentType.GENERAL, 'crimson-otter');
    registry.register(replacement, SubAgentType.EXPLORE, 'silver-wren');

    expect(registry.get(first.id)).toEqual({
      agent: replacement,
      agentType: SubAgentType.EXPLORE,
      nickname: 'silver-wren',
    });
    expect(registry.list()).toEqual([
      {
        id: first.id,
        agentType: SubAgentType.EXPLORE,
        title: 'Replacement',
        nickname: 'silver-wren',
        isRunning: false,
      },
    ]);
  });

  it('returns undefined for non-UUID ids during lookup', () => {
    const registry = new SubagentRegistry();

    expect(registry.get('not-a-uuid')).toBeUndefined();
  });

  it('evicts the least recently used idle entry when capacity is exceeded', () => {
    const registry = new SubagentRegistry({maxEntries: 2});
    const first = createMockAgent({title: 'First'});
    const second = createMockAgent({title: 'Second'});
    const third = createMockAgent({title: 'Third'});

    registry.register(first, SubAgentType.GENERAL, 'first-otter');
    registry.register(second, SubAgentType.EXPLORE, 'second-wren');
    registry.get(first.id);
    registry.register(third, SubAgentType.GENERAL, 'third-falcon');

    expect(registry.get(first.id)?.agent).toBe(first);
    expect(registry.get(second.id)).toBeUndefined();
    expect(registry.get(third.id)?.agent).toBe(third);
  });

  it('evicts idle entries before running entries', () => {
    const registry = new SubagentRegistry({maxEntries: 1});
    const running = createMockAgent({isRunning: true});
    const idle = createMockAgent();

    registry.register(running, SubAgentType.GENERAL, 'running-otter');
    registry.register(idle, SubAgentType.EXPLORE, 'idle-wren');

    expect(registry.get(running.id)?.agent).toBe(running);
    expect(registry.get(idle.id)).toBeUndefined();
  });

  it('evicts idle entries before entries with active SSE readers', () => {
    const registry = new SubagentRegistry({maxEntries: 1});
    const reading = createMockAgent({activeReaderCount: 1});
    const idle = createMockAgent();

    registry.register(reading, SubAgentType.GENERAL, 'reading-otter');
    registry.register(idle, SubAgentType.EXPLORE, 'idle-wren');

    expect(registry.get(reading.id)?.agent).toBe(reading);
    expect(registry.get(idle.id)).toBeUndefined();
  });

  it('keeps protected entries when there are no evictable entries', () => {
    const registry = new SubagentRegistry({maxEntries: 1});
    const running = createMockAgent({isRunning: true});
    const reading = createMockAgent({activeReaderCount: 1});

    registry.register(running, SubAgentType.GENERAL, 'running-otter');
    registry.register(reading, SubAgentType.EXPLORE, 'reading-wren');

    expect(registry.get(running.id)?.agent).toBe(running);
    expect(registry.get(reading.id)?.agent).toBe(reading);
  });

  it('evicts a newly registered idle entry when older entries are protected', () => {
    const registry = new SubagentRegistry({maxEntries: 1});
    const running = createMockAgent({isRunning: true});
    const newest = createMockAgent({title: 'Newest'});

    registry.register(running, SubAgentType.GENERAL, 'running-otter');
    registry.register(newest, SubAgentType.EXPLORE, 'newest-wren');

    expect(registry.get(newest.id)).toBeUndefined();
    expect(registry.list()).toEqual([
      {
        id: running.id,
        agentType: SubAgentType.GENERAL,
        title: 'New Session',
        nickname: 'running-otter',
        isRunning: true,
      },
    ]);
  });

  it('does not evict during missing lookups', () => {
    const registry = new SubagentRegistry({maxEntries: 1});
    const firstOverrides = {title: 'First', isRunning: true};
    const first = createMockAgent(firstOverrides);
    const second = createMockAgent({title: 'Second', activeReaderCount: 1});

    registry.register(first, SubAgentType.GENERAL, 'first-otter');
    registry.register(second, SubAgentType.EXPLORE, 'second-wren');
    firstOverrides.isRunning = false;

    expect(registry.get(crypto.randomUUID())).toBeUndefined();

    expect(registry.get(first.id)?.agent).toBe(first);
    expect(registry.get(second.id)?.agent).toBe(second);
  });

  it('does not evict before listing live records', () => {
    const registry = new SubagentRegistry({maxEntries: 1});
    const firstOverrides = {title: 'First', isRunning: true};
    const first = createMockAgent(firstOverrides);
    const secondOverrides = {title: 'Second', activeReaderCount: 1};
    const second = createMockAgent(secondOverrides);

    registry.register(first, SubAgentType.GENERAL, 'first-otter');
    registry.register(second, SubAgentType.EXPLORE, 'second-wren');
    firstOverrides.isRunning = false;
    secondOverrides.activeReaderCount = 0;

    expect(registry.list()).toEqual([
      {
        id: first.id,
        agentType: SubAgentType.GENERAL,
        title: 'First',
        nickname: 'first-otter',
        isRunning: false,
      },
      {
        id: second.id,
        agentType: SubAgentType.EXPLORE,
        title: 'Second',
        nickname: 'second-wren',
        isRunning: false,
      },
    ]);
  });

  it('clears live entries', () => {
    const registry = new SubagentRegistry();
    const agent = createMockAgent();

    registry.register(agent, SubAgentType.GENERAL, 'crimson-otter');
    registry.clear();

    expect(registry.list()).toEqual([]);
    expect(registry.get(agent.id)).toBeUndefined();
  });

  it('stores an explicit nickname and resolves it', () => {
    const registry = new SubagentRegistry();
    const agent = createMockAgent();

    registry.register(agent, SubAgentType.EXPLORE, 'crimson-otter');

    expect(registry.getByNickname('crimson-otter')).toEqual({
      agent,
      agentType: SubAgentType.EXPLORE,
      nickname: 'crimson-otter',
    });
  });

  it.each([
    ['empty', ''],
    ['whitespace-only', '   '],
    ['leading whitespace', ' crimson-otter'],
    ['trailing whitespace', 'crimson-otter '],
  ])('rejects a %s nickname', (_label, nickname) => {
    const registry = new SubagentRegistry();
    const agent = createMockAgent();

    expect(() => {
      registry.register(agent, SubAgentType.GENERAL, nickname);
    }).toThrow(/whitespace/);
  });

  it('returns undefined for an unknown nickname', () => {
    const registry = new SubagentRegistry();

    expect(registry.getByNickname('no-such-name')).toBeUndefined();
  });

  it('generates nicknames that avoid currently live ones', () => {
    const registry = new SubagentRegistry();
    registry.register(createMockAgent(), SubAgentType.GENERAL, 'crimson-otter');

    const fresh = registry.generateNickname();

    expect(fresh).not.toBe('crimson-otter');
    expect(fresh).toMatch(/^[a-z]+-[a-z]+$/);
  });
});
