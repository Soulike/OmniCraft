/**
 * Hard ceiling on attachment bytes materialized into a single provider
 * request. Unlike every other attachment limit, it is checked against bytes
 * **measured at read time**, never against a recorded `lastKnownByteSize`.
 *
 * That is the whole point. `COMPACTION_TRIGGER_ATTACHMENT_BYTES` sums what
 * history *recorded*, and a record can be defeated: the attachments directory
 * must stay writable for uploads to land, so anything running as this
 * process's user can replace a file — `unlink` plus recreate does it without
 * ever consulting the frozen read-only bit. Ten attachments recorded at 1 KiB
 * can be 2 MiB each on disk, and the trigger would see 10 KiB while the request
 * carried 20 MiB. No permission scheme closes that, so the defense cannot be
 * another record; it has to be a measurement taken where the bytes are read.
 *
 * Strictly above the compaction trigger so compaction always gets the first
 * chance to relieve pressure — reaching this ceiling means the accounting was
 * already wrong, and the turn degrades (over-budget attachments resolve to the
 * `too-large` placeholder) rather than failing. Base64 inflates bytes by 4/3,
 * so 20 MiB decoded is ~27 MiB on the wire, still inside the provider's 32 MiB
 * request limit with room for text and tool definitions.
 *
 * Lives here, not with the per-file caps in `agent/attachments/helpers/cap-for.ts`,
 * for two reasons. It is a statement about what a *provider request* may carry,
 * which is this layer's subject — the per-file caps are store-admission policy,
 * about what may be uploaded at all. And `llm-session`, which enforces it while
 * building the request, cannot reach `agent/`: the dependency runs `agent` →
 * `llm-session` → `llm-api`, never back.
 *
 * Its relationship to the compaction trigger and the per-message cap is pinned
 * by `compaction-constants.test.ts`.
 */
export const MAX_MATERIALIZED_ATTACHMENT_BYTES = 20 * 1024 * 1024;
