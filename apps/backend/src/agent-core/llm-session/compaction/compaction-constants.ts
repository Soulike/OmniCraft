import assert from 'node:assert';

import {
  MAX_DOCUMENT_ATTACHMENT_BYTES,
  MAX_IMAGE_ATTACHMENT_BYTES,
} from '../../agent/attachments/index.js';

/** Compact when the current prompt reaches this fraction of the model's prompt-token budget. */
export const COMPACTION_TRIGGER_PROMPT_TOKEN_RATIO = 0.9;

/** Number of latest messages included in the deterministic recent context. */
export const RECENT_CONTEXT_SOURCE_MESSAGE_COUNT = 20;

/** Maximum per-message content length used in deterministic recent context. */
export const RECENT_CONTEXT_ENTRY_TRUNCATE_LIMIT_CHARS = 2 * 1024;

/** Number of leading characters preserved in truncated recent context entries. */
export const RECENT_CONTEXT_ENTRY_TRUNCATE_HEAD_CHARS = 1024;

/** Number of trailing characters preserved in truncated recent context entries. */
export const RECENT_CONTEXT_ENTRY_TRUNCATE_TAIL_CHARS = 512;

/** Maximum tool/user content length kept in summary input before truncation. */
export const SUMMARY_INPUT_CONTENT_TRUNCATE_LIMIT_CHARS = 8 * 1024;

/** Number of leading characters preserved when truncating old content. */
export const SUMMARY_INPUT_CONTENT_TRUNCATE_HEAD_CHARS = 4 * 1024;

/** Number of trailing characters preserved when truncating old content. */
export const SUMMARY_INPUT_CONTENT_TRUNCATE_TAIL_CHARS = 2 * 1024;

/**
 * A single message's attachments may not exceed this. Strictly below
 * `COMPACTION_TRIGGER_ATTACHMENT_BYTES`, and at or above the largest per-file
 * cap. Enforced in the completions handler once descriptors are resolved from
 * disk, not from client-supplied numbers.
 */
export const MAX_MESSAGE_ATTACHMENT_BYTES = 12 * 1024 * 1024;

/** Total attachment bytes in history that force a compaction. */
export const COMPACTION_TRIGGER_ATTACHMENT_BYTES = 16 * 1024 * 1024;

// The invariant below is load-bearing, not tuning:
//
// - Strictly below the trigger: `LlmSession.sendMessages` appends the new
//   message to history *before* `compactBeforeModelCall` runs. If one legal
//   message could reach the trigger on its own, compaction would fire on the
//   very turn the attachment arrived (the model would see a summary instead
//   of the attachment) and that same message would still exceed the trigger
//   afterwards, re-firing compaction every following turn.
// - At or above the largest per-file cap: otherwise a single legal
//   attachment at `MAX_IMAGE_ATTACHMENT_BYTES` or `MAX_DOCUMENT_ATTACHMENT_BYTES`,
//   whichever is larger, could never be sent.
//
// A future edit to either constant must preserve both bounds, so assert
// rather than merely comment.
assert(
  MAX_MESSAGE_ATTACHMENT_BYTES < COMPACTION_TRIGGER_ATTACHMENT_BYTES,
  'MAX_MESSAGE_ATTACHMENT_BYTES must stay strictly below COMPACTION_TRIGGER_ATTACHMENT_BYTES',
);
assert(
  MAX_MESSAGE_ATTACHMENT_BYTES >=
    Math.max(MAX_IMAGE_ATTACHMENT_BYTES, MAX_DOCUMENT_ATTACHMENT_BYTES),
  'MAX_MESSAGE_ATTACHMENT_BYTES must stay at or above the largest per-file cap (MAX_IMAGE_ATTACHMENT_BYTES, MAX_DOCUMENT_ATTACHMENT_BYTES)',
);
