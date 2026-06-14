import {describe, expect, it} from 'vitest';

import {
  mathRenderingInstructions,
  preambleInstructions,
} from '@/agent/system-prompts/index.js';

import {generalSubAgentSystemPrompt} from './system-prompt.js';

describe('generalSubAgentSystemPrompt', () => {
  it('includes the shared math rendering instructions', () => {
    expect(generalSubAgentSystemPrompt).toContain(mathRenderingInstructions);
  });

  it('includes the shared preamble instructions', () => {
    expect(generalSubAgentSystemPrompt).toContain(preambleInstructions);
  });
});
