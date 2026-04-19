import {z} from 'zod';

/** Thinking/reasoning level for models that support extended thinking. */
export const thinkingLevelSchema = z.enum(['none', 'low', 'medium', 'high']);

export type ThinkingLevel = z.infer<typeof thinkingLevelSchema>;

/** Schema for the POST /chat/session request body. */
export const createSessionRequestSchema = z
  .object({
    workspace: z.string().optional(),
    extraAllowedPaths: z.array(z.string()).optional(),
  })
  .optional();

export type CreateSessionRequest = z.infer<typeof createSessionRequestSchema>;

/** Schema for the POST /chat/session response body. */
export const createSessionResponseSchema = z.object({
  sessionId: z.string(),
});

export type CreateSessionResponse = z.infer<typeof createSessionResponseSchema>;

/** Schema for the POST /chat/session/:id/completions request body. */
export const chatCompletionsRequestSchema = z.object({
  message: z.string().min(1),
  thinkingLevel: thinkingLevelSchema,
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
  id: z.string(),
  title: z.string(),
  workingDirectory: z.string().optional(),
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
