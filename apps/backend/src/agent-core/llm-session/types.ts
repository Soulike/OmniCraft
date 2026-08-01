import type {
  SseCompactionReason,
  SseContextCompactionEvent,
} from '@omnicraft/sse-events';
import type {LlmAttachment} from '@omnicraft/tool-schemas';
import {llmAttachmentSchema} from '@omnicraft/tool-schemas';
import {z} from 'zod';

import type {AttachmentResolution, ToolResultBlock} from '../llm-api/index.js';
import {llmMessageSchema, type LlmToolCall} from '../llm-api/index.js';
import type {AnyToolDefinition} from '../tool/types.js';

export const llmCompactionMetadataSchema = z.object({
  id: z.string(),
  compactedAt: z.number(),
  coveredMessageCount: z.number(),
  recentContextMessageCount: z.number(),
  beforeCharCount: z.number(),
  afterCharCount: z.number(),
  /** Every attachment the compacted history had seen, carried forward so a
   *  later compaction can still list it.
   *
   *  The replacement message holds `attachments: []` — that emptiness is what
   *  lets compaction relieve the byte pressure it fired on — so a second
   *  compaction reading only `message.attachments` would find nothing and drop
   *  the path list. That list is the entire basis for treating "compaction
   *  loses the bytes" as acceptable: the file is still on disk and the summary
   *  names it. Losing it on the second pass would quietly retract that.
   *
   *  `.default([])` so sessions compacted before this field existed still
   *  parse; they simply have no catalog to carry. */
  attachments: z.array(llmAttachmentSchema).default([]),
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

/**
 * Materializes an attachment's bytes as base64 for a provider call, or a
 * reason it could not be delivered. Injected so `agent-core` never reaches
 * up into the service layer, and so tests can supply a fake.
 */
export type AttachmentResolver = (
  attachment: LlmAttachment,
  /** Bytes still available in the request's materialization budget. A resolver
   *  must refuse — rather than read — anything larger, so the budget bounds
   *  memory instead of merely reporting on it afterwards. */
  remainingBytes: number,
) => Promise<AttachmentResolution>;

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
