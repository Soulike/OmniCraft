import type {
  SseCompactionReason,
  SseContextCompactionEvent,
} from '@omnicraft/sse-events';
import {z} from 'zod';

import {llmMessageSchema, type LlmToolCall} from '../llm-api/index.js';
import type {ToolResultBlock} from '../llm-api/types.js';
import type {AnyToolDefinition} from '../tool/types.js';

export const llmCompactionMetadataSchema = z.object({
  id: z.string(),
  compactedAt: z.number(),
  coveredMessageCount: z.number(),
  recentContextMessageCount: z.number(),
  beforeCharCount: z.number(),
  afterCharCount: z.number(),
});

export type LlmCompactionMetadata = z.infer<typeof llmCompactionMetadataSchema>;

export const llmSessionUsageSchema = z.object({
  currentContextInputTokens: z.number(),
  latestCallOutputTokens: z.number(),
  sessionInputTokens: z.number(),
  sessionOutputTokens: z.number(),
  sessionCacheReadInputTokens: z.number(),
});

/** Latest context usage and accumulated token totals for an LLM session. */
export type LlmSessionUsage = z.infer<typeof llmSessionUsageSchema>;

/** Serializable snapshot of an LlmSession, used for persistence. */
export const llmSessionSnapshotSchema = z.object({
  id: z.string(),
  messages: z.array(llmMessageSchema),
  compactions: z.array(llmCompactionMetadataSchema),
  latestUsageInputMessageCount: z.number().nullable(),
  usage: llmSessionUsageSchema,
});

export type LlmSessionSnapshot = z.infer<typeof llmSessionSnapshotSchema>;

/** A tool execution result to submit back to the LLM. */
export interface ToolResult {
  callId: string;
  content: ToolResultBlock[];
  status: 'success' | 'failure';
}

export interface LlmCompactionOptions {
  readonly reason: SseCompactionReason;
  readonly tools: readonly AnyToolDefinition[];
  readonly systemPrompt: string;
  readonly signal?: AbortSignal;
}

/** A text content delta from the LLM. */
export interface LlmSessionTextDeltaEvent {
  type: 'text-delta';
  content: string;
}

/** Thinking/reasoning has started. */
export interface LlmSessionThinkingStartEvent {
  type: 'thinking-start';
}

/** A thinking/reasoning content delta from the LLM. */
export interface LlmSessionThinkingDeltaEvent {
  type: 'thinking-delta';
  content: string;
}

/** Thinking/reasoning has ended. */
export interface LlmSessionThinkingEndEvent {
  type: 'thinking-end';
}

/** A fully assembled tool call from the LLM. */
export interface LlmSessionToolCallEvent {
  type: 'tool-call';
  toolCall: LlmToolCall;
}

/** The LLM has started producing a new assistant message. */
export interface LlmSessionMessageStartEvent {
  type: 'message-start';
  messageId: string;
  createdAt: number;
}

/** A context compaction SSE event surfaced from inside sendMessages. */
export interface LlmSessionCompactionSseEvent {
  type: 'compaction-sse';
  event: SseContextCompactionEvent;
}

/** Events yielded by LlmSession.sendMessage(). */
export type LlmSessionEvent =
  | LlmSessionTextDeltaEvent
  | LlmSessionThinkingStartEvent
  | LlmSessionThinkingDeltaEvent
  | LlmSessionThinkingEndEvent
  | LlmSessionToolCallEvent
  | LlmSessionMessageStartEvent
  | LlmSessionCompactionSseEvent;

/** An async generator that yields LlmSession events. */
export type LlmSessionEventStream = AsyncGenerator<
  LlmSessionEvent,
  void,
  undefined
>;

/** Return value of LlmSession.sendUserMessage(). */
export interface SendUserMessageResult {
  stream: LlmSessionEventStream;
  messageId: string;
  createdAt: number;
}

/** Return value of LlmSession.sendReminder(). Adds the escaped reminder text
 *  actually injected, so callers surface the same text (e.g. in an SSE event)
 *  without re-escaping. */
export interface SendReminderResult extends SendUserMessageResult {
  /** The injected reminder body, HTML-escaped (so e.g. `<` is `&lt;`). This is
   *  the body the LLM received, without the `<system-reminder>` wrapper. */
  content: string;
}
