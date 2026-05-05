import assert from 'node:assert';
import crypto from 'node:crypto';

import type {ThinkingLevel} from '@omnicraft/api-schema';
import type {SseContextCompactionEvent} from '@omnicraft/sse-events';
import {z} from 'zod';

import {Mutex} from '@/helpers/mutex.js';

import type {
  LlmAssistantMessage,
  LlmConfig,
  LlmMessage,
  LlmThinkingBlock,
  LlmToolCall,
} from '../llm-api/index.js';
import {llmApi} from '../llm-api/index.js';
import {estimatePromptTokens} from '../llm-api/token-estimator.js';
import {modelCapacity} from '../model-capacity/index.js';
import type {ToolDefinition} from '../tool/types.js';
import {COMPACTION_TRIGGER_INPUT_TOKEN_RATIO} from './compaction/constants.js';
import {buildCompactedMessageContent} from './compaction/prompt.js';
import {buildRecentContext} from './compaction/slim.js';
import {generateCompactionSummary} from './compaction/summary.js';
import {createEmptyLlmSessionUsage} from './helpers.js';
import type {
  LlmCompactionMetadata,
  LlmCompactionOptions,
  LlmSessionEventStream,
  LlmSessionSnapshot,
  LlmSessionUsage,
  SendUserMessageResult,
  ToolResult,
} from './types.js';

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error ? signal.reason : new Error('Aborted');
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
  private readonly compactions: LlmCompactionMetadata[] = [];
  private usage: LlmSessionUsage = createEmptyLlmSessionUsage();
  /** Number of messages covered by the latest provider input-token usage. */
  private usageBaselineMessageCount: number | null = null;
  private readonly getConfig: () => Promise<LlmConfig>;
  private readonly mutex = new Mutex();

  constructor(
    getConfig: () => Promise<LlmConfig>,
    snapshot?: LlmSessionSnapshot,
  ) {
    this.getConfig = getConfig;

    if (snapshot) {
      this.id = snapshot.id;
      this.messages.push(...snapshot.messages);
      this.compactions.push(...snapshot.compactions);
      this.usage = {...snapshot.usage};
      this.usageBaselineMessageCount = snapshot.usageBaselineMessageCount;
    } else {
      this.id = crypto.randomUUID();
    }
  }

  /** Returns a serializable snapshot of this session. */
  toSnapshot(): LlmSessionSnapshot {
    return {
      id: this.id,
      messages: [...this.messages],
      compactions: [...this.compactions],
      usageBaselineMessageCount: this.usageBaselineMessageCount,
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
    tools: readonly ToolDefinition[],
    systemPrompt: string,
    thinkingLevel: ThinkingLevel,
    signal?: AbortSignal,
  ): SendUserMessageResult {
    const userMessage = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      role: 'user' as const,
      content,
    };
    return {
      stream: this.sendMessages(
        [userMessage],
        tools,
        systemPrompt,
        thinkingLevel,
        signal,
      ),
      messageId: userMessage.id,
      createdAt: userMessage.createdAt,
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
    tools: readonly ToolDefinition[],
    systemPrompt: string,
    thinkingLevel: ThinkingLevel,
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
    yield* this.sendMessages(
      toolMessages,
      tools,
      systemPrompt,
      thinkingLevel,
      signal,
    );
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
  ): AsyncGenerator<SseContextCompactionEvent, void, void> {
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
    this.compactions.length = 0;
    this.usage = createEmptyLlmSessionUsage();
    this.usageBaselineMessageCount = null;
  }

  /**
   * Appends messages to history, streams a completion from the LLM, and
   * rolls back if the stream is cancelled or errors. Serialized via mutex.
   */
  private async *sendMessages(
    messages: LlmMessage[],
    tools: readonly ToolDefinition[],
    systemPrompt: string,
    thinkingLevel: ThinkingLevel,
    signal?: AbortSignal,
  ): LlmSessionEventStream {
    const release = await this.mutex.acquire();
    const rollbackMessages = [...this.messages];
    const rollbackCompactions = [...this.compactions];
    const rollbackUsage = {...this.usage};
    const rollbackUsageBaselineMessageCount = this.usageBaselineMessageCount;
    this.messages.push(...messages);
    let completed = false;
    try {
      for await (const event of this.compactBeforeModelCall(
        tools,
        systemPrompt,
        thinkingLevel,
        signal,
      )) {
        yield {type: 'compaction-sse', event};
      }
      throwIfAborted(signal);
      yield* this.streamCompletion(tools, systemPrompt, thinkingLevel, signal);
      completed = true;
    } finally {
      if (!completed) {
        this.messages.length = 0;
        this.messages.push(...rollbackMessages);
        this.compactions.length = 0;
        this.compactions.push(...rollbackCompactions);
        this.usage = rollbackUsage;
        this.usageBaselineMessageCount = rollbackUsageBaselineMessageCount;
      }
      release();
    }
  }

  private async *compactBeforeModelCall(
    tools: readonly ToolDefinition[],
    systemPrompt: string,
    thinkingLevel: ThinkingLevel,
    signal?: AbortSignal,
  ): AsyncGenerator<SseContextCompactionEvent, void, void> {
    try {
      throwIfAborted(signal);
      yield* this.compactIfNeededUnlocked({
        reason: 'before-llm-call',
        tools,
        systemPrompt,
        thinkingLevel,
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
  ): AsyncGenerator<SseContextCompactionEvent, void, void> {
    const config = await this.getConfig();
    const maxInputTokens = await modelCapacity.getMaxInputTokens(config);
    const currentTokens = this.estimatePromptTokensForCompaction(options);

    if (currentTokens < maxInputTokens * COMPACTION_TRIGGER_INPUT_TOKEN_RATIO) {
      return;
    }

    if (this.messages.length === 0) return;

    const compactionId = crypto.randomUUID();
    const beforeTokens = currentTokens;
    const coveredMessageCount = this.messages.length;
    const startedAt = Date.now();

    yield {
      type: 'context-compaction-start',
      compactionId,
      reason: options.reason,
      beforeTokens,
      messageCount: coveredMessageCount,
    };

    const beforeCharCount = JSON.stringify(this.messages).length;

    try {
      const summary = await generateCompactionSummary({
        config,
        messages: this.messages,
        tools: options.tools,
        ...(options.signal ? {signal: options.signal} : {}),
      });
      throwIfAborted(options.signal);
      if (!summary) {
        throw new Error('Compaction summary is empty');
      }

      const recentContext = buildRecentContext(this.messages, options.tools);
      const summaryMessage: LlmMessage = {
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        role: 'user',
        content: buildCompactedMessageContent({
          summary,
          recentContext: recentContext.content,
        }),
      };

      this.messages.length = 0;
      this.messages.push(summaryMessage);
      this.usageBaselineMessageCount = null;
      const afterTokens = this.estimatePromptTokensFromMessages(options);
      this.usage = {
        ...this.usage,
        currentContextInputTokens: afterTokens,
        latestCallOutputTokens: 0,
      };
      this.compactions.push({
        id: compactionId,
        compactedAt: Date.now(),
        coveredMessageCount,
        recentContextMessageCount: recentContext.sourceMessageCount,
        beforeCharCount,
        afterCharCount: JSON.stringify(this.messages).length,
      });

      yield {
        type: 'context-compaction-end',
        compactionId,
        summary,
        beforeTokens,
        afterTokens,
        messageCount: coveredMessageCount,
        durationMs: Date.now() - startedAt,
      };
    } catch (err: unknown) {
      const errMessage =
        err instanceof Error
          ? err.message
          : typeof err === 'string'
            ? err
            : 'Unknown error';
      yield {
        type: 'context-compaction-error',
        compactionId,
        reason: options.reason,
        message: options.signal?.aborted ? 'Aborted' : errMessage,
        beforeTokens,
        messageCount: coveredMessageCount,
      };
      throw err instanceof Error ? err : new Error(errMessage);
    }
  }

  private estimatePromptTokensForCompaction(
    options: LlmCompactionOptions,
  ): number {
    const latestUsageEstimate = this.estimatePromptTokensFromLatestUsage();
    if (latestUsageEstimate !== null) return latestUsageEstimate;

    return this.estimatePromptTokensFromMessages(options);
  }

  private estimatePromptTokensFromMessages(
    options: LlmCompactionOptions,
  ): number {
    return estimatePromptTokens({
      messages: this.messages,
      ...(options.systemPrompt ? {systemPrompt: options.systemPrompt} : {}),
      tools: options.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: z.toJSONSchema(tool.parameters),
      })),
      thinkingLevel: options.thinkingLevel,
    });
  }

  private estimatePromptTokensFromLatestUsage(): number | null {
    if (this.usageBaselineMessageCount === null) return null;
    if (this.usage.currentContextInputTokens <= 0) return null;

    const pendingStart = this.usageBaselineMessageCount + 1;
    if (pendingStart > this.messages.length) return null;

    const pendingMessages = this.messages.slice(pendingStart);
    const pendingInputTokens =
      pendingMessages.length > 0 ? estimatePromptTokens(pendingMessages) : 0;

    return (
      this.usage.currentContextInputTokens +
      this.usage.latestCallOutputTokens +
      pendingInputTokens
    );
  }

  /**
   * Streams a completion from the LLM using the current message history.
   * Yields text deltas in real-time, then fully assembled tool calls.
   * Records the assistant message in history when done.
   */
  private async *streamCompletion(
    tools: readonly ToolDefinition[],
    systemPrompt: string,
    thinkingLevel: ThinkingLevel,
    signal?: AbortSignal,
  ): LlmSessionEventStream {
    const llmConfig = await this.getConfig();
    const inputMessageCount = this.messages.length;
    const eventStream = llmApi.streamCompletion({
      config: llmConfig,
      messages: this.messages,
      systemPrompt: systemPrompt || undefined,
      tools,
      thinkingLevel,
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
          this.usageBaselineMessageCount = inputMessageCount;
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
