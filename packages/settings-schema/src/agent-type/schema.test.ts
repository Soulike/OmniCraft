import {describe, expect, it} from 'vitest';

import {AgentType, agentTypeSchema} from './schema.js';

describe('agentTypeSchema', () => {
  it('accepts the known agent types', () => {
    expect(agentTypeSchema.parse('chat')).toBe('chat');
    expect(agentTypeSchema.parse('coding')).toBe('coding');
  });

  it('rejects unknown agent types', () => {
    expect(agentTypeSchema.safeParse('other').success).toBe(false);
  });

  it('exposes constants matching the enum', () => {
    expect(agentTypeSchema.options).toEqual([AgentType.CHAT, AgentType.CODING]);
  });
});
