import {describe, expect, it} from 'vitest';

import {buildSystemPrompt} from './agent-catalog.js';

describe('buildSystemPrompt environment section', () => {
  it('describes two locations when the scratch dir differs from the working dir', () => {
    const prompt = buildSystemPrompt('BASE', [], [], '/repo', '/scratch');
    expect(prompt).toContain('- Working directory: /repo');
    expect(prompt).toContain('- Scratch space: /scratch');
    expect(prompt).toContain('## Working Directory vs Scratch Space');
    expect(prompt).not.toContain('This session has no project repository');
  });

  it('describes a single location when working dir equals scratch dir', () => {
    const prompt = buildSystemPrompt('BASE', [], [], '/scratch', '/scratch');
    expect(prompt).toContain('- Working directory: /scratch');
    expect(prompt).not.toContain('- Scratch space:');
    expect(prompt).not.toContain('## Working Directory vs Scratch Space');
    expect(prompt).toContain('## Scratch Space');
    expect(prompt).toContain('This session has no project repository');
  });
});
