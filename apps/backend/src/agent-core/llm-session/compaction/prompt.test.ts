import {describe, expect, it} from 'vitest';

import {buildCompactionPrompt} from './prompt.js';

describe('buildCompactionPrompt', () => {
  it('includes summary instructions and history', () => {
    const prompt = buildCompactionPrompt(['message one']);

    expect(prompt).toContain('Preserve user goals');
    expect(prompt).toContain('<history_to_summarize>');
    expect(prompt).toContain('message one');
  });
});
