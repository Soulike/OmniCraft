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

/** Schema for the POST /chat/session/:id/generate-title request body. */
export const generateTitleRequestSchema = z.object({
  userMessage: z.string().min(1),
  assistantMessage: z.string().min(1),
});

export type GenerateTitleRequest = z.infer<typeof generateTitleRequestSchema>;

/** Schema for the POST /chat/session/:id/generate-title response body. */
export const generateTitleResponseSchema = z.object({
  title: z.string(),
});

export type GenerateTitleResponse = z.infer<typeof generateTitleResponseSchema>;
