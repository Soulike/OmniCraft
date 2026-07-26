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
 * Total attachment bytes in history that force a compaction. Strictly above
 * `MAX_MESSAGE_ATTACHMENT_BYTES` (see `cap-for.ts`) — the relationship is
 * pinned by `compaction-constants.test.ts`. `LlmSession.sendMessages` appends
 * the new message to history *before* `compactBeforeModelCall` runs, so if a
 * single legal message could reach this trigger on its own, compaction would
 * fire on the very turn the attachment arrived (the model would see a summary
 * instead of the attachment) and that same message would still exceed the
 * trigger afterwards, re-firing compaction every following turn.
 */
export const COMPACTION_TRIGGER_ATTACHMENT_BYTES = 16 * 1024 * 1024;
