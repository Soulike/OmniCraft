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
