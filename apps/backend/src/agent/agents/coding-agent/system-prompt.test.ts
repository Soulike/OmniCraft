import {describe, expect, it} from 'vitest';

import {
  mathRenderingInstructions,
  preambleInstructions,
} from '@/agent/system-prompts/index.js';

import {codingAgentSystemPrompt} from './system-prompt.js';

describe('codingAgentSystemPrompt', () => {
  it('includes the shared math rendering instructions', () => {
    expect(codingAgentSystemPrompt).toContain(mathRenderingInstructions);
  });

  it('includes the shared preamble instructions', () => {
    expect(codingAgentSystemPrompt).toContain(preambleInstructions);
  });

  it('includes tier-aware delegation guidance', () => {
    expect(codingAgentSystemPrompt).toContain('Delegating Subtasks');
    expect(codingAgentSystemPrompt).toContain('cheapest tier');
  });
});
