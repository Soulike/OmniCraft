import {describe, expect, it} from 'vitest';

import {SubagentRegistry} from './subagent-registry.js';

describe('SubagentRegistry', () => {
  const agent1 = '11111111-1111-4111-8111-111111111111';
  const agent2 = '22222222-2222-4222-8222-222222222222';

  it('starts empty by default', () => {
    const registry = new SubagentRegistry();

    expect(registry.list()).toEqual([]);
  });

  it('registers subagents in insertion order', () => {
    const registry = new SubagentRegistry();

    registry.register({id: agent1, agentType: 'general'});
    registry.register({id: agent2, agentType: 'explore'});

    expect(registry.list()).toEqual([
      {id: agent1, agentType: 'general'},
      {id: agent2, agentType: 'explore'},
    ]);
  });

  it('updates an existing record without changing its position', () => {
    const registry = new SubagentRegistry([
      {id: agent1, agentType: 'general'},
      {id: agent2, agentType: 'explore'},
    ]);

    registry.register({id: agent1, agentType: 'explore'});

    expect(registry.list()).toEqual([
      {id: agent1, agentType: 'explore'},
      {id: agent2, agentType: 'explore'},
    ]);
  });

  it('returns immutable snapshots of records', () => {
    const registry = new SubagentRegistry([{id: agent1, agentType: 'general'}]);

    const listed = registry.list();
    listed.push({id: agent2, agentType: 'explore'});

    expect(registry.list()).toEqual([{id: agent1, agentType: 'general'}]);
  });

  it('rejects non-UUID ids during lookup', () => {
    const registry = new SubagentRegistry();

    expect(() => registry.get('not-a-uuid')).toThrow();
  });
});
