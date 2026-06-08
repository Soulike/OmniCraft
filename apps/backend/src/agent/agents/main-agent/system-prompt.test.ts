import {describe, expect, it} from 'vitest';

import {mainAgentSystemPrompt} from './system-prompt.js';

describe('mainAgentSystemPrompt', () => {
  it('instructs the model to use markdown math delimiters rendered by chat', () => {
    expect(mainAgentSystemPrompt).toContain('$...$');
    expect(mainAgentSystemPrompt).toContain('$$...$$');
    expect(mainAgentSystemPrompt).toContain('\\(...\\)');
    expect(mainAgentSystemPrompt).toContain('\\[...\\]');
  });
});
