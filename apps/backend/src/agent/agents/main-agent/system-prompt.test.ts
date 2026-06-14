import {describe, expect, it} from 'vitest';

import {
  mathRenderingInstructions,
  preambleInstructions,
} from '@/agent/system-prompts/index.js';

import {mainAgentSystemPrompt} from './system-prompt.js';

describe('mainAgentSystemPrompt', () => {
  it('includes the shared math rendering instructions', () => {
    expect(mainAgentSystemPrompt).toContain(mathRenderingInstructions);
  });

  it('includes the shared preamble instructions', () => {
    expect(mainAgentSystemPrompt).toContain(preambleInstructions);
  });
});
