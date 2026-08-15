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
    expect(content).not.toContain('Recent attachments');
  });

  // `run_command` runs `/bin/sh -l -c`, and these lines are the one place the
  // store's names are handed to a model as something it may copy onto a
  // command line. A name may legitimately contain `;` or a space —
  // `placeUniquely` generates `name (2).ext` itself — so the constraint
  // belongs here rather than in the sanitizer.
  it('shell-quotes each path so a crafted name cannot become a second command', () => {
    const content = compactionPromptBuilder.buildCompactedMessageContent({
      summary: 's',
      recentContext: 'r',
      attachments: [
        {
          fileName: 'photo;printf INJECTED;.png',
          mediaType: 'image/png',
          lastKnownByteSize: 64,
        },
      ],
      attachmentsDirectory: '/data/attachments',
    });

    expect(content).toContain("'/data/attachments/photo;printf INJECTED;.png'");
    expect(content).not.toContain(
      '- /data/attachments/photo;printf INJECTED;.png',
    );
  });

  it('escapes a single quote in the name rather than closing the quoting', () => {
    const content = compactionPromptBuilder.buildCompactedMessageContent({
      summary: 's',
      recentContext: 'r',
      attachments: [
        {
          fileName: "it's;id.png",
          mediaType: 'image/png',
          lastKnownByteSize: 64,
        },
      ],
      attachmentsDirectory: '/data/attachments',
    });

    expect(content).toContain(`'/data/attachments/it'\\''s;id.png'`);
  });

  it('lists absolute paths with sizes and no tool name', () => {
    const content = compactionPromptBuilder.buildCompactedMessageContent({
      summary: 's',
      recentContext: 'r',
      attachments: [
        {
          fileName: 'invoice.pdf',
          mediaType: 'application/pdf',
          lastKnownByteSize: 240_640,
        },
        {
          fileName: 'shot.png',
          mediaType: 'image/png',
          lastKnownByteSize: 831_488,
        },
      ],
      attachmentsDirectory: '/data/sessions/x/scratch/attachments',
    });

    expect(content).toContain(
      '## Recent attachments from earlier in this conversation',
    );
    expect(content).toContain(
      "- '/data/sessions/x/scratch/attachments/invoice.pdf' — application/pdf, 235 KB",
    );
    expect(content).toContain(
      "- '/data/sessions/x/scratch/attachments/shot.png' — image/png, 812 KB",
    );
    // Source-agnostic and tool-agnostic by design — see the spec.
    expect(content).not.toContain('read_file');
    expect(content).not.toContain('uploaded');
    expect(content).not.toContain('1 MB');
  });

  it('bounds the recent-memory hint to the ten newest catalog entries', () => {
    const attachments = Array.from({length: 12}, (_, index) => ({
      fileName: `attachment-${index.toString().padStart(2, '0')}.png`,
      mediaType: 'image/png' as const,
      lastKnownByteSize: index + 1,
    }));

    const content = compactionPromptBuilder.buildCompactedMessageContent({
      summary: 's',
      recentContext: 'r',
      attachments,
      attachmentsDirectory: '/data/attachments',
    });

    expect(content).toContain('not a complete inventory');
    expect(content).toContain('2 older attachments omitted.');
    expect(content).not.toContain('attachment-00.png');
    expect(content).not.toContain('attachment-01.png');
    expect(content).toContain('attachment-02.png');
    expect(content).toContain('attachment-11.png');
    expect(content.match(/^- '/gmu)).toHaveLength(10);
  });

  it('omits the section when the session has no attachments directory', () => {
    const content = compactionPromptBuilder.buildCompactedMessageContent({
      summary: 's',
      recentContext: 'r',
      attachments: [
        {fileName: 'a.png', mediaType: 'image/png', lastKnownByteSize: 1},
      ],
      attachmentsDirectory: null,
    });
    expect(content).not.toContain('Recent attachments');
  });
});
