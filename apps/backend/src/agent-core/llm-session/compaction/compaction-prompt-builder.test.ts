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
      attachments: [],
      attachmentsDirectory: null,
    });

    expect(content).toContain('<conversation_summary>');
    expect(content).toContain('summary text');
    expect(content).toContain('<recent_context>');
    expect(content).toContain('recent text');
    expect(content).toContain('<continuation_instructions>');
  });
});

describe('buildCompactedMessageContent attachments', () => {
  it('omits the section when there are no attachments', () => {
    const content = compactionPromptBuilder.buildCompactedMessageContent({
      summary: 's',
      recentContext: 'r',
      attachments: [],
      attachmentsDirectory: '/data/sessions/x/scratch/attachments',
    });
    expect(content).not.toContain('Attachments you saw earlier');
  });

  it('lists absolute paths with sizes and no tool name', () => {
    const content = compactionPromptBuilder.buildCompactedMessageContent({
      summary: 's',
      recentContext: 'r',
      attachments: [
        {
          fileName: 'invoice.pdf',
          mediaType: 'application/pdf',
          byteSize: 240_640,
        },
        {fileName: 'shot.png', mediaType: 'image/png', byteSize: 831_488},
      ],
      attachmentsDirectory: '/data/sessions/x/scratch/attachments',
    });

    expect(content).toContain(
      '## Attachments you saw earlier in this conversation',
    );
    expect(content).toContain(
      '- /data/sessions/x/scratch/attachments/invoice.pdf — application/pdf, 235 KB',
    );
    expect(content).toContain(
      '- /data/sessions/x/scratch/attachments/shot.png — image/png, 812 KB',
    );
    // Source-agnostic and tool-agnostic by design — see the spec.
    expect(content).not.toContain('read_file');
    expect(content).not.toContain('uploaded');
    expect(content).not.toContain('1 MB');
  });

  it('omits the section when the session has no attachments directory', () => {
    const content = compactionPromptBuilder.buildCompactedMessageContent({
      summary: 's',
      recentContext: 'r',
      attachments: [{fileName: 'a.png', mediaType: 'image/png', byteSize: 1}],
      attachmentsDirectory: null,
    });
    expect(content).not.toContain('Attachments you saw earlier');
  });
});
