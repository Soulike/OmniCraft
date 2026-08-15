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
 * pinned by `compaction-constants.test.ts`.
 *
 * What that buys: **compaction must be triggered by accumulated history, never
 * by one legal message on its own.** `LlmSession.sendMessages` appends the new
 * message before `compactBeforeModelCall` runs, so if a single message at the
 * per-message cap could reach this trigger by itself, sending an attachment
 * that large would compact every time — including as the first message of an
 * empty session. The feature would be unusable at its own documented limit.
 *
 * What it does *not* buy, deliberately: an attachment can still be summarized
 * away on the turn it arrives, once history has accumulated enough that this
 * message pushes the total over. The model then reads the compaction summary's
 * path list rather than the bytes. That is by design — the file is still on
 * disk and the summary names it, so the model can read it back when it needs
 * to (https://github.com/Soulike/OmniCraft/issues/391 makes that a reference
 * rather than base64). Do not add a rule preserving the pending message here
 * on the strength of that outcome alone.
 *
 * An earlier version of this comment also claimed a single over-trigger
 * message would "still exceed the trigger afterwards, re-firing compaction
 * every following turn". That was wrong: compaction replaces history with a
 * synthetic message carrying `attachments: []`, so the sum drops to zero and
 * nothing re-fires.
 */
export const COMPACTION_TRIGGER_ATTACHMENT_BYTES = 16 * 1024 * 1024;
