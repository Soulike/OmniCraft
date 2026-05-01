/** Compact when the current prompt reaches this fraction of model input capacity. */
export const COMPACTION_THRESHOLD_RATIO = 0.8;

/** Version tag for persisted compaction metadata and future strategy migrations. */
export const COMPACTION_STRATEGY_VERSION = 1;

/** Number of latest messages included in the deterministic recent context. */
export const RECENT_CONTEXT_MESSAGE_COUNT = 20;

/** Maximum per-message content length used in deterministic recent context. */
export const RECENT_CONTEXT_TRUNCATE_LIMIT = 2 * 1024;

/** Number of leading characters preserved in truncated recent context entries. */
export const RECENT_CONTEXT_TRUNCATE_HEAD = 1024;

/** Number of trailing characters preserved in truncated recent context entries. */
export const RECENT_CONTEXT_TRUNCATE_TAIL = 512;

/** Maximum tool/user content length kept in summary input before truncation. */
export const DEFAULT_TRUNCATE_LIMIT = 8 * 1024;

/** Number of leading characters preserved when truncating old content. */
export const DEFAULT_TRUNCATE_HEAD = 4 * 1024;

/** Number of trailing characters preserved when truncating old content. */
export const DEFAULT_TRUNCATE_TAIL = 2 * 1024;
