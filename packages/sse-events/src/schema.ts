import {thinkingLevelSchema} from '@omnicraft/api-schema';
import {toolNameSchema, toolResultDataSchema} from '@omnicraft/tool-schemas';
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
  toolName: toolNameSchema,
  displayName: z.string(),
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
  status: z.enum(['success', 'failure', 'error']),
  data: toolResultDataSchema,
});
export type SseToolExecuteEndEvent = z.infer<
  typeof sseToolExecuteEndEventSchema
>;

/** A new message is starting. Carries message identity and timestamp. */
export const sseMessageStartEventSchema = z.object({
  type: z.literal('message-start'),
  role: z.enum(['user', 'assistant']),
  messageId: z.string(),
  createdAt: z.number(),
});
export type SseMessageStartEvent = z.infer<typeof sseMessageStartEventSchema>;

/** Intermediate streaming output from a running tool. */
export const sseToolExecuteDeltaEventSchema = z.object({
  type: z.literal('tool-execute-delta'),
  callId: z.string(),
  content: z.string(),
});
export type SseToolExecuteDeltaEvent = z.infer<
  typeof sseToolExecuteDeltaEventSchema
>;

/** Token usage statistics shared between backend and frontend. */
export const sseUsageSchema = z.object({
  model: z.string(),
  maxInputTokens: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheReadInputTokens: z.number(),
});
export type SseUsage = z.infer<typeof sseUsageSchema>;

/** Stream completed. Reason indicates whether it finished normally or was capped. */
export const sseDoneEventSchema = z.object({
  type: z.literal('done'),
  reason: z.enum(['complete', 'max_rounds_reached']),
  usage: sseUsageSchema,
});
export type SseDoneEvent = z.infer<typeof sseDoneEventSchema>;

/** Thinking/reasoning has started. */
export const sseThinkingStartEventSchema = z.object({
  type: z.literal('thinking-start'),
});
export type SseThinkingStartEvent = z.infer<typeof sseThinkingStartEventSchema>;

/** A thinking/reasoning content delta from the LLM. */
export const sseThinkingDeltaEventSchema = z.object({
  type: z.literal('thinking-delta'),
  content: z.string(),
});
export type SseThinkingDeltaEvent = z.infer<typeof sseThinkingDeltaEventSchema>;

/** Thinking/reasoning has ended. */
export const sseThinkingEndEventSchema = z.object({
  type: z.literal('thinking-end'),
});
export type SseThinkingEndEvent = z.infer<typeof sseThinkingEndEventSchema>;

/** An error occurred during streaming. */
export const sseErrorEventSchema = z.object({
  type: z.literal('error'),
  message: z.string(),
});
export type SseErrorEvent = z.infer<typeof sseErrorEventSchema>;

// ---------------------------------------------------------------------------
// Base event union (all events except error and subagent events).
// Used as the inner event type for subagent-output to prevent recursion.
// ---------------------------------------------------------------------------

/** Union of base SSE events that can appear inside a subagent-output wrapper. */
export const sseBaseEventSchema = z.discriminatedUnion('type', [
  sseMessageStartEventSchema,
  sseTextDeltaEventSchema,
  sseThinkingStartEventSchema,
  sseThinkingDeltaEventSchema,
  sseThinkingEndEventSchema,
  sseToolExecuteStartEventSchema,
  sseToolExecuteDeltaEventSchema,
  sseToolExecuteEndEventSchema,
  sseDoneEventSchema,
]);
export type SseBaseEvent = z.infer<typeof sseBaseEventSchema>;

// ---------------------------------------------------------------------------
// Subagent events
// ---------------------------------------------------------------------------

/** A subagent has been dispatched to handle a subtask. */
export const sseSubagentDispatchEventSchema = z.object({
  type: z.literal('subagent-dispatch'),
  agentId: z.string(),
  task: z.string(),
  agentType: z.string(),
  thinkingLevel: thinkingLevelSchema,
  workingDirectory: z.string(),
});
export type SseSubagentDispatchEvent = z.infer<
  typeof sseSubagentDispatchEventSchema
>;

/** A forwarded event from a running subagent. */
export const sseSubagentOutputEventSchema = z.object({
  type: z.literal('subagent-output'),
  agentId: z.string(),
  event: sseBaseEventSchema,
});
export type SseSubagentOutputEvent = z.infer<
  typeof sseSubagentOutputEventSchema
>;

/** A subagent has finished its work. */
export const sseSubagentCompleteEventSchema = z.object({
  type: z.literal('subagent-complete'),
  agentId: z.string(),
  status: z.enum(['success', 'failure']),
});
export type SseSubagentCompleteEvent = z.infer<
  typeof sseSubagentCompleteEventSchema
>;

/** Union of all subagent-related events. */
export type SseSubAgentEvent =
  | SseSubagentDispatchEvent
  | SseSubagentOutputEvent
  | SseSubagentCompleteEvent;

// ---------------------------------------------------------------------------
// Full event union
// ---------------------------------------------------------------------------

/** Validates known SSE event types. Unknown types fail validation. */
export const sseEventSchema = z.discriminatedUnion('type', [
  sseMessageStartEventSchema,
  sseTextDeltaEventSchema,
  sseThinkingStartEventSchema,
  sseThinkingDeltaEventSchema,
  sseThinkingEndEventSchema,
  sseToolExecuteStartEventSchema,
  sseToolExecuteDeltaEventSchema,
  sseToolExecuteEndEventSchema,
  sseDoneEventSchema,
  sseErrorEventSchema,
  sseSubagentDispatchEventSchema,
  sseSubagentOutputEventSchema,
  sseSubagentCompleteEventSchema,
]);

/** Union of all known SSE events. */
export type SseEvent = z.infer<typeof sseEventSchema>;
