import {describe, expect, it} from 'vitest';

import {AgentType, agentTypeSchema} from './schema.js';

describe('agentTypeSchema', () => {
  it('keeps the const object and the enum schema in sync', () => {
    expect(agentTypeSchema.options).toEqual([AgentType.CHAT, AgentType.CODING]);
  });
});
