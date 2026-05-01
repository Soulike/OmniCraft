/** Compact when the current prompt reaches this fraction of model input capacity. */
export const COMPACTION_TRIGGER_INPUT_TOKEN_RATIO = 0.8;

/** Version tag for persisted compaction metadata and future strategy migrations. */
export const COMPACTED_MESSAGE_STRATEGY_VERSION = 1;

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
