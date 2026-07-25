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
  byteSize: z.number().int().nonnegative(),
});

export type LlmAttachment = z.infer<typeof llmAttachmentSchema>;
