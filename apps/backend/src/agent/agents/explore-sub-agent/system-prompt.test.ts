import {describe, expect, it} from 'vitest';

import {
  mathRenderingInstructions,
  preambleInstructions,
} from '@/agent/system-prompts/index.js';

import {exploreSubAgentSystemPrompt} from './system-prompt.js';

describe('exploreSubAgentSystemPrompt', () => {
  it('includes the shared math rendering instructions', () => {
    expect(exploreSubAgentSystemPrompt).toContain(mathRenderingInstructions);
  });

  it('includes the shared preamble instructions', () => {
    expect(exploreSubAgentSystemPrompt).toContain(preambleInstructions);
  });
});
