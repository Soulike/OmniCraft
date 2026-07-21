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

/** Schema for a single session entry in the list response. */
export const sessionMetadataSchema = z.object({
  id: sessionIdSchema,
  title: z.string(),
  workingDirectory: z.string().optional(),
  updatedAt: z.number().optional(), // epoch ms; last-activity (snapshot mtime, may be fractional)
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
