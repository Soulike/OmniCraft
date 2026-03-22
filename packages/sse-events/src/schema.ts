import {z} from 'zod';

/** A text content delta from the LLM. */
export const sseTextDeltaEventSchema = z.object({
  type: z.literal('text-delta'),
  content: z.string(),
});
export type SseTextDeltaEvent = z.infer<typeof sseTextDeltaEventSchema>;

/** A fully assembled tool call from the LLM. */
export const sseToolCallEventSchema = z.object({
  type: z.literal('tool-call'),
  toolCall: z.object({
    callId: z.string(),
    toolName: z.string(),
    arguments: z.string(),
  }),
});
export type SseToolCallEvent = z.infer<typeof sseToolCallEventSchema>;

/** Stream completed successfully. */
export const sseDoneEventSchema = z.object({
  type: z.literal('done'),
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
  sseToolCallEventSchema,
  sseDoneEventSchema,
  sseErrorEventSchema,
]);

/** Union of all known SSE events. */
export type SseEvent = z.infer<typeof sseEventSchema>;
