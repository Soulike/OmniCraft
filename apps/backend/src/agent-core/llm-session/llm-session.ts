import assert from 'node:assert';
import crypto from 'node:crypto';

import type {SseContextCompactionEvent} from '@omnicraft/sse-events';
import type {LlmAttachment} from '@omnicraft/tool-schemas';

import {Mutex} from '@/helpers/mutex.js';

import type {
  AttachmentResolution,
  LlmAssistantMessage,
  LlmConfig,
  LlmMessage,
  LlmRequestMessage,
  LlmThinkingBlock,
  LlmToolCall,
  ResolvedLlmAttachment,
} from '../llm-api/index.js';
import {llmApi, MAX_MATERIALIZED_ATTACHMENT_BYTES} from '../llm-api/index.js';
import type {AnyToolDefinition} from '../tool/types.js';
import {
  type LlmSessionCompactionPatch,
  llmSessionCompactor,
} from './compaction/index.js';
import {createEmptyLlmSessionUsage} from './helpers.js';
import {sanitizeReminderContent} from './sanitize-reminder.js';
import type {
  AttachmentResolver,
  LlmCompactionMetadata,
  LlmCompactionOptions,
  LlmSessionEventStream,
  LlmSessionSnapshot,
  LlmSessionUsage,
  SendReminderResult,
  SendUserMessageResult,
  ToolResult,
} from './types.js';

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error ? signal.reason : new Error('Aborted');
}

/** Constructor options for {@link LlmSession}. `snapshot` is the only
 *  optional field — a fresh session has none, but every production caller
 *  needs attachments resolved, so `resolveAttachment` and
 *  `attachmentsDirectory` are required rather than silently degrading to a
 *  session that can never deliver an attachment. */
export interface LlmSessionOptions {
  readonly getConfig: () => Promise<LlmConfig>;
  readonly snapshot?: LlmSessionSnapshot;
  readonly resolveAttachment: AttachmentResolver;
  readonly attachmentsDirectory: string;
}

/**
 * In-memory LLM conversation context.
 *
 * Manages the message history, calls the LLM API, and assembles assistant
 * messages from the raw event stream. Exposes a high-level event stream
 * to callers: text deltas for real-time rendering, and fully assembled
 * tool calls at the end.
 *
 * Can be serialized to disk for persistence in a future version.
 */
export class LlmSession {
  /** Unique identifier for this session, usable as a storage key. */
  readonly id: string;

  private readonly messages: LlmMessage[] = [];
  /** Every attachment committed to this session's model-visible history,
   *  including ones whose messages a compaction has replaced. */
  private readonly attachmentCatalog = new Map<string, LlmAttachment>();
  private readonly compactions: LlmCompactionMetadata[] = [];
  private usage: LlmSessionUsage = createEmptyLlmSessionUsage();
  /** Number of messages covered by the latest provider input-token usage. */
  private latestUsageInputMessageCount: number | null = null;
  private readonly getConfig: () => Promise<LlmConfig>;
  private readonly resolveAttachment: AttachmentResolver;
  private readonly attachmentsDirectory: string;
  private readonly mutex = new Mutex();

  constructor(options: LlmSessionOptions) {
    const {getConfig, snapshot, resolveAttachment, attachmentsDirectory} =
      options;
    this.getConfig = getConfig;
    this.resolveAttachment = resolveAttachment;
    this.attachmentsDirectory = attachmentsDirectory;

    if (snapshot) {
      this.id = snapshot.id;
      this.messages.push(...snapshot.messages);
      for (const attachment of snapshot.attachmentCatalog) {
        this.attachmentCatalog.set(attachment.fileName, attachment);
      }
      this.compactions.push(...snapshot.compactions);
      this.usage = {...snapshot.usage};
      this.latestUsageInputMessageCount = snapshot.latestUsageInputMessageCount;
    } else {
      this.id = crypto.randomUUID();
    }
  }

  /** Returns a serializable snapshot of this session. */
  toSnapshot(): LlmSessionSnapshot {
    return {
      id: this.id,
      messages: [...this.messages],
      attachmentCatalog: [...this.attachmentCatalog.values()],
      compactions: [...this.compactions],
      latestUsageInputMessageCount: this.latestUsageInputMessageCount,
      usage: {...this.usage},
    };
  }

  /**
   * Sends a user message to the LLM and returns a result containing
   * the event stream and the user message's metadata.
   *
   * The stream yields `message-start` for the assistant reply,
   * `text-delta` events for real-time streaming, then `tool-call`
   * events with fully assembled tool calls (if any). Once fully consumed,
   * the user message and assistant reply are recorded in the history.
   */
  sendUserMessage(
    content: string,
    tools: readonly AnyToolDefinition[],
    systemPrompt: string,
    signal?: AbortSignal,
    attachments: readonly LlmAttachment[] = [],
  ): SendUserMessageResult {
    const userMessage = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      role: 'user' as const,
      content,
      attachments: [...attachments],
    };
    return {
      stream: this.sendMessages([userMessage], tools, systemPrompt, signal),
      messageId: userMessage.id,
      createdAt: userMessage.createdAt,
    };
  }

  /**
   * Injects a hidden reminder as a `user` message wrapped in
   * `<system-reminder>` and continues the conversation. Used by the turn runner
   * when a stop-check blocks the turn from ending. The reminder is visible to
   * the LLM but is surfaced to clients via a `stop-check-reminder` SSE event
   * (not `message-start`), so it never renders in the UI.
   *
   * This method is the SOLE owner of reminder sanitization: `content` may be
   * raw, untrusted, tool-supplied text (e.g. todo subjects derived from
   * repository content), and the wrapper delimiters are stripped here —
   * otherwise a `</system-reminder>` embedded in the content could close the
   * privileged wrapper early and smuggle text outside it (second-order prompt
   * injection). The sanitized body is returned as `content` so callers surface
   * the exact injected text without re-sanitizing.
   */
  sendReminder(
    content: string,
    tools: readonly AnyToolDefinition[],
    systemPrompt: string,
    signal?: AbortSignal,
  ): SendReminderResult {
    const safeContent = sanitizeReminderContent(content);
    const reminderMessage = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      role: 'user' as const,
      content: `<system-reminder>\n${safeContent}\n</system-reminder>`,
      attachments: [],
    };
    return {
      stream: this.sendMessages([reminderMessage], tools, systemPrompt, signal),
      messageId: reminderMessage.id,
      createdAt: reminderMessage.createdAt,
      content: safeContent,
    };
  }

  /**
   * Submits tool execution results and continues the LLM conversation.
   *
   * Records each tool result in the history, then calls the LLM so it
   * can incorporate the results. Returns the same high-level event stream
   * as `sendMessage`.
   */
  async *submitToolResults(
    results: ToolResult[],
    tools: readonly AnyToolDefinition[],
    systemPrompt: string,
    signal?: AbortSignal,
  ): LlmSessionEventStream {
    const toolMessages: LlmMessage[] = results.map((result) => ({
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      role: 'tool' as const,
      callId: result.callId,
      content: result.content,
      status: result.status,
    }));
    yield* this.sendMessages(toolMessages, tools, systemPrompt, signal);
  }

  /** Returns latest context usage and accumulated token totals for this session. */
  getUsage(): LlmSessionUsage {
    return {...this.usage};
  }

  /** Returns a shallow copy of the full message history. */
  getMessages(): LlmMessage[] {
    return [...this.messages];
  }

  async *compactIfNeeded(
    options: LlmCompactionOptions,
  ): AsyncGenerator<SseContextCompactionEvent, void, undefined> {
    const release = await this.mutex.acquire();
    try {
      yield* this.compactIfNeededUnlocked(options);
    } finally {
      release();
    }
  }

  /** Clears all messages and resets usage. */
  clear(): void {
    this.messages.length = 0;
    this.attachmentCatalog.clear();
    this.compactions.length = 0;
    this.usage = createEmptyLlmSessionUsage();
    this.latestUsageInputMessageCount = null;
  }

  /**
   * Appends messages to history, streams a completion from the LLM, and
   * rolls back if the stream is cancelled or errors. Serialized via mutex.
   */
  private async *sendMessages(
    messages: LlmMessage[],
    tools: readonly AnyToolDefinition[],
    systemPrompt: string,
    signal?: AbortSignal,
  ): LlmSessionEventStream {
    const release = await this.mutex.acquire();
    const rollbackMessages = [...this.messages];
    const rollbackAttachmentCatalog = new Map(this.attachmentCatalog);
    const rollbackCompactions = [...this.compactions];
    const rollbackUsage = {...this.usage};
    const rollbackLatestUsageInputMessageCount =
      this.latestUsageInputMessageCount;
    this.messages.push(...messages);
    this.recordAttachments(messages);
    let completed = false;
    try {
      for await (const event of this.compactBeforeModelCall(
        tools,
        systemPrompt,
        signal,
      )) {
        yield {type: 'compaction-sse', event};
      }
      throwIfAborted(signal);
      yield* this.streamCompletion(tools, systemPrompt, signal);
      completed = true;
    } finally {
      if (!completed) {
        this.messages.length = 0;
        this.messages.push(...rollbackMessages);
        this.attachmentCatalog.clear();
        for (const [fileName, attachment] of rollbackAttachmentCatalog) {
          this.attachmentCatalog.set(fileName, attachment);
        }
        this.compactions.length = 0;
        this.compactions.push(...rollbackCompactions);
        this.usage = rollbackUsage;
        this.latestUsageInputMessageCount =
          rollbackLatestUsageInputMessageCount;
      }
      release();
    }
  }

  private recordAttachments(messages: readonly LlmMessage[]): void {
    for (const message of messages) {
      if (message.role !== 'user') continue;
      for (const attachment of message.attachments) {
        if (!this.attachmentCatalog.has(attachment.fileName)) {
          this.attachmentCatalog.set(attachment.fileName, attachment);
        }
      }
    }
  }

  private async *compactBeforeModelCall(
    tools: readonly AnyToolDefinition[],
    systemPrompt: string,
    signal?: AbortSignal,
  ): AsyncGenerator<SseContextCompactionEvent, void, undefined> {
    try {
      throwIfAborted(signal);
      yield* this.compactIfNeededUnlocked({
        reason: 'before-llm-call',
        tools,
        systemPrompt,
        ...(signal ? {signal} : {}),
      });
      throwIfAborted(signal);
    } catch (error: unknown) {
      if (signal?.aborted) {
        throw error instanceof Error ? error : new Error('Aborted');
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to compact LLM session before model call: ${message}`,
        {cause: error},
      );
    }
  }

  private async *compactIfNeededUnlocked(
    options: LlmCompactionOptions,
  ): AsyncGenerator<SseContextCompactionEvent, void, undefined> {
    const config = await this.getConfig();
    yield* llmSessionCompactor.compactIfNeeded({
      config,
      messages: this.messages,
      usage: this.usage,
      latestUsageInputMessageCount: this.latestUsageInputMessageCount,
      attachmentsDirectory: this.attachmentsDirectory,
      attachments: [...this.attachmentCatalog.values()],
      options,
      commit: (patch) => {
        this.applyCompactionPatch(patch);
      },
    });
  }

  private applyCompactionPatch(patch: LlmSessionCompactionPatch): void {
    this.messages.length = 0;
    this.messages.push(...patch.messages);
    this.latestUsageInputMessageCount = patch.latestUsageInputMessageCount;
    this.usage = patch.usage;
    this.compactions.push(patch.metadata);
  }

  /**
   * Projects persisted history onto the request-time shape, materializing
   * attachment bytes. Nothing here is stored, so the snapshot stays free of
   * base64. History is re-sent on every tool round, so this re-reads each
   * attachment per round — see the plan's "Tunables" note before adding a cache.
   *
   * Bounded by `MAX_MATERIALIZED_ATTACHMENT_BYTES`, charged against the bytes
   * each read actually returns. Every other attachment limit is checked against
   * a recorded `lastKnownByteSize`, and a record can be defeated by anything
   * that replaces a file on disk; this one cannot, because it never consults a
   * record. Attachments past the budget resolve to the `too-large` placeholder,
   * so the turn degrades instead of failing.
   *
   * Two properties of the walk are load-bearing:
   *
   * - **Sequential, not `Promise.all`.** A running budget is meaningless if the
   *   reads race — every one of them would see the same "remaining" and the
   *   total could overshoot by an arbitrary factor.
   * - **Newest attachment first.** History is oldest-first, so charging in that
   *   order would spend the budget on stale turns and drop the image the user
   *   just asked about. Resolution order is reversed; emission order is not.
   */
  private async toRequestMessages(): Promise<LlmRequestMessage[]> {
    const resolutions = new Map<LlmAttachment, AttachmentResolution>();
    let remainingBytes = MAX_MATERIALIZED_ATTACHMENT_BYTES;

    const newestFirst = this.messages
      .filter((message) => message.role === 'user')
      .flatMap((message) => message.attachments)
      .reverse();

    for (const attachment of newestFirst) {
      const resolution = await this.resolveAttachment(
        attachment,
        remainingBytes,
      );
      if (resolution.data !== null) {
        remainingBytes -= resolution.materializedByteSize;
      }
      resolutions.set(attachment, resolution);
    }

    return this.messages.map((message): LlmRequestMessage => {
      if (message.role !== 'user') return message;
      const attachments = message.attachments.map(
        (attachment): ResolvedLlmAttachment => ({
          ...attachment,
          // Deliberately last: a successful resolution's media type describes
          // the bytes just read and overrides the persisted observation. Every
          // attachment was visited above, so a miss is impossible; the fallback
          // keeps this total without an assertion the type cannot see.
          ...(resolutions.get(attachment) ?? {data: null, reason: 'missing'}),
        }),
      );
      return {...message, attachments};
    });
  }

  /**
   * Streams a completion from the LLM using the current message history.
   * Yields text deltas in real-time, then fully assembled tool calls.
   * Records the assistant message in history when done.
   */
  private async *streamCompletion(
    tools: readonly AnyToolDefinition[],
    systemPrompt: string,
    signal?: AbortSignal,
  ): LlmSessionEventStream {
    const llmConfig = await this.getConfig();
    const inputMessageCount = this.messages.length;
    const messages = await this.toRequestMessages();
    const eventStream = llmApi.streamCompletion({
      config: llmConfig,
      messages,
      systemPrompt: systemPrompt || undefined,
      tools,
      signal,
    });

    let textContent = '';
    let assistantId: string | null = null;
    let assistantCreatedAt: number | null = null;
    const toolCalls: LlmToolCall[] = [];
    const thinkingBlocks: LlmThinkingBlock[] = [];
    const pendingToolCalls = new Map<string, LlmToolCall>();

    for await (const event of eventStream) {
      switch (event.type) {
        case 'text-delta':
          textContent += event.content;
          yield {type: 'text-delta', content: event.content};
          break;
        case 'thinking-start':
          yield {type: 'thinking-start'};
          break;
        case 'thinking-delta':
          yield {type: 'thinking-delta', content: event.content};
          break;
        case 'thinking-end':
          thinkingBlocks.push(event.block);
          yield {type: 'thinking-end'};
          break;
        case 'tool-call-start':
          pendingToolCalls.set(event.callId, {
            callId: event.callId,
            toolName: event.toolName,
            arguments: '',
          });
          break;
        case 'tool-call-delta': {
          const tc = pendingToolCalls.get(event.callId);
          if (tc) {
            tc.arguments += event.argumentsDelta;
          }
          break;
        }
        case 'tool-call-end': {
          const tc = pendingToolCalls.get(event.callId);
          if (tc) {
            // When the LLM emits no argument deltas (e.g. parameterless tools),
            // the accumulated string is still empty. Normalize to valid JSON.
            if (!tc.arguments) {
              tc.arguments = '{}';
            }
            toolCalls.push(tc);
            pendingToolCalls.delete(event.callId);
          }
          break;
        }
        case 'message-end':
          this.usage = {
            currentContextInputTokens: event.usage.inputTokens,
            latestCallOutputTokens: event.usage.outputTokens,
            sessionInputTokens:
              this.usage.sessionInputTokens + event.usage.inputTokens,
            sessionOutputTokens:
              this.usage.sessionOutputTokens + event.usage.outputTokens,
            sessionCacheReadInputTokens:
              this.usage.sessionCacheReadInputTokens +
              event.usage.cacheReadInputTokens,
          };
          this.latestUsageInputMessageCount = inputMessageCount;
          break;
        case 'message-start':
          assistantCreatedAt = Date.now();
          assistantId = crypto.randomUUID();
          yield {
            type: 'message-start',
            messageId: assistantId,
            createdAt: assistantCreatedAt,
          };
          break;
      }
    }

    for (const toolCall of toolCalls) {
      yield {type: 'tool-call', toolCall};
    }

    assert(
      assistantId !== null && assistantCreatedAt !== null,
      'LLM adapter did not emit message-start event',
    );

    const assistantMessage: LlmAssistantMessage = {
      id: assistantId,
      createdAt: assistantCreatedAt,
      role: 'assistant',
      content: textContent,
      toolCalls,
      thinking: thinkingBlocks,
    };
    this.messages.push(assistantMessage);
  }
}
