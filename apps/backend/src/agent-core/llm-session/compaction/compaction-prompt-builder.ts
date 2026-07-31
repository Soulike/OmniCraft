import path from 'node:path';

import type {LlmAttachment} from '@omnicraft/tool-schemas';

import {formatAttachmentSize} from '../../llm-api/index.js';

/**
 * Wraps a path in POSIX single quotes so it is one shell word whatever it
 * contains.
 *
 * A stored file name may legitimately contain `;`, backticks, `$(`, spaces and
 * parentheses — `sanitizeFileName` has no business removing those, and
 * `placeUniquely` generates `name (2).ext` itself. But these lines are the one
 * place the store's names are handed to a model as something it may copy onto
 * a command line, and `run_command` runs `/bin/sh -l -c`, so an unquoted
 * `photo;printf X;.png` would execute `printf X` as a second command.
 *
 * Quoting here rather than sanitizing there keeps the constraint where the
 * shell actually is. The failure mode if a model copies the quotes somewhere
 * they do not belong is a visible "no such file", which it can recover from;
 * the failure mode of not quoting is silent command execution.
 */
function toShellSafePath(absolutePath: string): string {
  return `'${absolutePath.split("'").join(`'\\''`)}'`;
}

export interface BuildCompactedMessageContentOptions {
  readonly summary: string;
  readonly recentContext: string;
  readonly attachments: readonly LlmAttachment[];
  /** Absolute attachments directory, or null when the session has no store. */
  readonly attachmentsDirectory: string | null;
}

const CONTINUATION_INSTRUCTIONS =
  'Continue from this compacted state. Treat the summary and recent context as the authoritative conversation state. Preserve user requirements, constraints, and corrections. Do not repeat completed work unless needed. If task progress is tracked by available tools, inspect it when needed before planning or acting.';

export class CompactionPromptBuilder {
  buildCompactionPrompt(slimmedMessages: readonly string[]): string {
    return [
      'Summarize the conversation history for an agent that will continue working.',
      'Preserve user goals, explicit requirements, corrections, constraints, preferences, and acceptance criteria.',
      'Preserve important files, paths, commands, tool results, errors, failures, hypotheses, decisions, pending work, and next steps.',
      'Do not invent facts. Do not weaken user instructions because they appeared early.',
      'Return only the summary text.',
      '',
      '<history_to_summarize>',
      ...slimmedMessages,
      '</history_to_summarize>',
    ].join('\n');
  }

  /**
   * Tells the model the files it already saw are still readable. Names neither
   * the source (a tool result lands in the same list once
   * https://github.com/Soulike/OmniCraft/issues/388 ships) nor a specific tool
   * (catalogs differ per agent, and restating the media size limit would
   * duplicate a number read_file already interpolates from its own constant).
   */
  private buildAttachmentSection(
    attachments: readonly LlmAttachment[],
    attachmentsDirectory: string | null,
  ): string[] {
    if (attachments.length === 0 || attachmentsDirectory === null) return [];

    return [
      '',
      '## Attachments you saw earlier in this conversation',
      '',
      'You have already seen these files. They were dropped from the context by',
      'compaction, but they are still on disk — read them again if you need them.',
      'The paths are shell-quoted; drop the surrounding quotes if you pass one to',
      'a tool that takes a path directly rather than a command line.',
      '',
      ...attachments.map(
        (attachment) =>
          `- ${toShellSafePath(path.join(attachmentsDirectory, attachment.fileName))} — ${attachment.mediaType}, ${formatAttachmentSize(attachment.lastKnownByteSize)}`,
      ),
    ];
  }

  buildCompactedMessageContent(
    options: BuildCompactedMessageContentOptions,
  ): string {
    return [
      '<conversation_summary>',
      options.summary,
      '</conversation_summary>',
      '',
      '<recent_context>',
      options.recentContext,
      '</recent_context>',
      ...this.buildAttachmentSection(
        options.attachments,
        options.attachmentsDirectory,
      ),
      '',
      '<continuation_instructions>',
      CONTINUATION_INSTRUCTIONS,
      '</continuation_instructions>',
    ].join('\n');
  }
}

export const compactionPromptBuilder = new CompactionPromptBuilder();
