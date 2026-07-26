import {llmAttachmentSchema} from '@omnicraft/tool-schemas';
import {z} from 'zod';

import {sessionIdSchema} from '../agent-id/schema.js';

/** Schema for the POST /chat/session request body. */
export const createSessionRequestSchema = z.strictObject({});

export type CreateSessionRequest = z.infer<typeof createSessionRequestSchema>;

/** Schema for the POST /coding/session request body. */
export const createCodingSessionRequestSchema = z.strictObject({
  workspace: z.string(),
});

export type CreateCodingSessionRequest = z.infer<
  typeof createCodingSessionRequestSchema
>;

/** Schema for the POST /chat/session response body. */
export const createSessionResponseSchema = z.object({
  sessionId: sessionIdSchema,
});

export type CreateSessionResponse = z.infer<typeof createSessionResponseSchema>;

/** Schema for the POST /chat/session/:id/completions request body. */
export const chatCompletionsRequestSchema = z.strictObject({
  message: z.string().min(1),
  // Names only. The server re-stats and re-sniffs each file, so a client cannot
  // misreport a media type or size. Text is always required — an attachment
  // never substitutes for it. Capped at 10 to bound how many stat+sniff
  // operations one request can force; the byte total itself is enforced
  // after resolution, in `Agent.claimAttachments`.
  //
  // Rejected rather than deduplicated when a name repeats. Nothing downstream
  // collapses them — `claimAttachments` keeps one descriptor per occurrence and
  // request construction materializes the same bytes once each — so a repeat
  // multiplies a file against both the per-message and materialization budgets
  // and sends the model duplicate blocks. Sending a name twice has no meaning,
  // so it is a client bug, and a 400 says so rather than silently changing the
  // request out from under a UI that thinks it attached three files.
  attachmentFileNames: z
    .array(z.string().min(1))
    .max(10)
    .refine((names) => new Set(names).size === names.length, {
      message: 'attachmentFileNames must not contain duplicates',
    })
    .default([]),
});

export type ChatCompletionsRequest = z.infer<
  typeof chatCompletionsRequestSchema
>;

/**
 * Schema for the POST /chat/session/:id/tool-response request body.
 *
 * The `result` field is untyped (`unknown`) because each client-side tool
 * defines its own response schema. The frontend must construct the value
 * according to that schema, and the tool's `execute` must validate it.
 */
export const submitToolResponseRequestSchema = z.object({
  interactionId: z.string().min(1),
  result: z.unknown(),
});

export type SubmitToolResponseRequest = z.infer<
  typeof submitToolResponseRequestSchema
>;

/** Schema for the POST /chat|coding/session/:id/attachments query string. */
export const uploadAttachmentQuerySchema = z.object({
  name: z.string().min(1),
});

export type UploadAttachmentQuery = z.infer<typeof uploadAttachmentQuerySchema>;

/**
 * Schema for the POST /chat|coding/session/:id/attachments response body. The
 * stored name may differ from the requested one — it is sanitized, given the
 * extension of the sniffed media type, and uniquified against collisions.
 */
export const uploadAttachmentResponseSchema = llmAttachmentSchema;

export type UploadAttachmentResponse = z.infer<
  typeof uploadAttachmentResponseSchema
>;

/** Schema for a single session entry in the list response. */
export const sessionMetadataSchema = z.object({
  id: sessionIdSchema,
  title: z.string(),
  workingDirectory: z.string().optional(),
  updatedAt: z.number().optional(), // epoch ms; last-activity (snapshot mtime, may be fractional)
  isRunning: z.boolean().optional(), // in-memory turn/title-gen state; absent = idle (e.g. after restart)
  isWaitingForInput: z.boolean().optional(), // in-memory: blocked on a client tool call; absent = not waiting
});

export type SessionMetadata = z.infer<typeof sessionMetadataSchema>;

/** Schema for the GET /chat/sessions query parameters. Both are required. */
export const listSessionsQuerySchema = z.object({
  offset: z.coerce.number().int().min(0),
  limit: z.coerce.number().int().min(1),
});

export type ListSessionsQuery = z.infer<typeof listSessionsQuerySchema>;

/** Schema for the GET /chat/sessions response body. */
export const listSessionsResponseSchema = z.object({
  sessions: z.array(sessionMetadataSchema),
  total: z.number(),
});

export type ListSessionsResponse = z.infer<typeof listSessionsResponseSchema>;
