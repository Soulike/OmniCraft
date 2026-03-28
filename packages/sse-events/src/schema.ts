import {z} from 'zod';

/** A text content delta from the LLM. */
export const sseTextDeltaEventSchema = z.object({
  type: z.literal('text-delta'),
  content: z.string(),
});
export type SseTextDeltaEvent = z.infer<typeof sseTextDeltaEventSchema>;

/** A tool has started executing. */
export const sseToolExecuteStartEventSchema = z.object({
  type: z.literal('tool-execute-start'),
  callId: z.string(),
  toolName: z.string(),
  arguments: z.string(),
});
export type SseToolExecuteStartEvent = z.infer<
  typeof sseToolExecuteStartEventSchema
>;

/** A tool has finished executing. */
export const sseToolExecuteEndEventSchema = z.object({
  type: z.literal('tool-execute-end'),
  callId: z.string(),
  result: z.string(),
  isError: z.boolean(),
});
export type SseToolExecuteEndEvent = z.infer<
  typeof sseToolExecuteEndEventSchema
>;

/** Stream completed. Reason indicates whether it finished normally or was capped. */
export const sseDoneEventSchema = z.object({
  type: z.literal('done'),
  reason: z.enum(['complete', 'max_rounds_reached']),
});
export type SseDoneEvent = z.infer<typeof sseDoneEventSchema>;

/** An error occurred during streaming. */
export const sseErrorEventSchema = z.object({
  type: z.literal('error'),
  message: z.string(),
});
export type SseErrorEvent = z.infer<typeof sseErrorEventSchema>;

/** Validates known SSE event types. Unknown types fail validation. */
export const sseEventSchema = z.discriminatedUnion('type', [
  sseTextDeltaEventSchema,
  sseToolExecuteStartEventSchema,
  sseToolExecuteEndEventSchema,
  sseDoneEventSchema,
  sseErrorEventSchema,
]);

/** Union of all known SSE events. */
export type SseEvent = z.infer<typeof sseEventSchema>;
