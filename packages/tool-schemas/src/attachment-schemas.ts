import {z} from 'zod';

import {
  documentMediaTypeSchema,
  imageMediaTypeSchema,
} from './media-type-schemas.js';

/**
 * A binary file delivered to the model alongside a message. A reference only —
 * the bytes live in the session's attachment store, and base64 is materialized
 * just before a provider call.
 *
 * Deliberately source-agnostic: it records what the file is, never who produced
 * it. A user upload is the first producer; tool results follow in
 * https://github.com/Soulike/OmniCraft/issues/388.
 *
 * Lives here rather than in the backend because the backend message schema, the
 * SSE event schema, and the HTTP upload response all reference it, and
 * `@omnicraft/sse-events` cannot import from `apps/backend`.
 */
export const llmAttachmentSchema = z.object({
  fileName: z.string().min(1),
  mediaType: z.union([imageMediaTypeSchema, documentMediaTypeSchema]),
  /**
   * The file's size the last time anything looked. **Never authoritative.**
   *
   * Named for what it is rather than for a moment, because there is no single
   * moment: a `save()` counts bytes as it writes them, a `describe()` stats the
   * file just now, and a value read back out of history is whatever `describe()`
   * said when the message was sent. All three are true when produced and none
   * of them stays true — the attachments directory has to be writable for
   * uploads to land, so anything running as this process's user can replace a
   * file's contents (and `unlink` plus recreate does it without ever consulting
   * the frozen read-only bit).
   *
   * So: fine for display, for a compaction-scheduling estimate, and for a
   * validator that only decides a 304. Not fine for anything that bounds
   * memory, frames a response, or decides what to send — those must measure the
   * bytes they actually handle. This field is the reminder to ask which one you
   * are doing.
   */
  lastKnownByteSize: z.number().int().nonnegative(),
});

export type LlmAttachment = z.infer<typeof llmAttachmentSchema>;
