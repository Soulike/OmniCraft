import {describe, expect, it} from 'vitest';

import {compactionPromptBuilder} from './compaction-prompt-builder.js';

describe('buildCompactionPrompt', () => {
  it('includes summary instructions and history', () => {
    const prompt = compactionPromptBuilder.buildCompactionPrompt([
      'message one',
    ]);

    expect(prompt).toContain('Preserve user goals');
    expect(prompt).toContain('<history_to_summarize>');
    expect(prompt).toContain('message one');
  });
});

describe('buildCompactedMessageContent', () => {
  it('wraps summary, recent context, and continuation instructions', () => {
    const content = compactionPromptBuilder.buildCompactedMessageContent({
      summary: 'summary text',
      recentContext: 'recent text',
    });

    expect(content).toContain('<conversation_summary>');
    expect(content).toContain('summary text');
    expect(content).toContain('<recent_context>');
    expect(content).toContain('recent text');
    expect(content).toContain('<continuation_instructions>');
  });
});
