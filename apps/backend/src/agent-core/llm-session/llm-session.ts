import assert from 'node:assert';
import crypto from 'node:crypto';

import type {ThinkingLevel} from '@omnicraft/api-schema';

import {Mutex} from '@/helpers/mutex.js';

import type {
  LlmAssistantMessage,
  LlmConfig,
  LlmMessage,
  LlmThinkingBlock,
  LlmToolCall,
  LlmUsage,
} from '../llm-api/index.js';
import {llmApi} from '../llm-api/index.js';
import {modelCapacity} from '../model-capacity/index.js';
import type {ToolDefinition} from '../tool/types.js';
import {
  buildCompactionPrompt,
  COMPACTION_STRATEGY_VERSION,
  COMPACTION_THRESHOLD_RATIO,
  generateCompactionSummary,
  MIN_RAW_MESSAGES,
  slimMessagesForSummary,
  splitCompactablePrefix,
} from './compaction/index.js';
import type {
  LlmCompactionMetadata,
  LlmCompactionOptions,
  LlmSessionEventStream,
  LlmSessionSnapshot,
  SendUserMessageResult,
  ToolResult,
} from './types.js';

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
  private usage: LlmUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
  };
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

  /** Returns the accumulated token usage across all LLM calls in this session. */
  getUsage(): LlmUsage {
    return {...this.usage};
  }

  /** Returns a shallow copy of the full message history. */
  getMessages(): LlmMessage[] {
    return [...this.messages];
  }

  async compactIfNeeded(options: LlmCompactionOptions): Promise<boolean> {
    const release = await this.mutex.acquire();
    try {
      return await this.compactIfNeededUnlocked(options);
    } finally {
      release();
    }
  }

  /** Clears all messages and resets usage. */
  clear(): void {
    this.messages.length = 0;
    this.compactions.length = 0;
    this.usage = {inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0};
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
    this.messages.push(...messages);
    let completed = false;
    try {
      yield* this.streamCompletion(tools, systemPrompt, thinkingLevel, signal);
      completed = true;
    } finally {
      if (!completed) {
        this.messages.length = 0;
        this.messages.push(...rollbackMessages);
        this.compactions.length = 0;
        this.compactions.push(...rollbackCompactions);
      }
      release();
    }
  }

  private async compactIfNeededUnlocked(
    options: LlmCompactionOptions,
  ): Promise<boolean> {
    const config = await this.getConfig();
    const maxInputTokens = await modelCapacity.getMaxInputTokens(config);
    const currentTokens = await llmApi.countToken({
      config,
      messages: this.messages,
      systemPrompt: options.systemPrompt || undefined,
      tools: options.tools,
      thinkingLevel: options.thinkingLevel,
    });

    if (currentTokens < maxInputTokens * COMPACTION_THRESHOLD_RATIO) {
      return false;
    }

    const beforeCharCount = JSON.stringify(this.messages).length;
    const {compactablePrefix, rawSuffix} = splitCompactablePrefix(
      this.messages,
      {minRawMessages: MIN_RAW_MESSAGES},
    );

    if (compactablePrefix.length === 0) return false;

    const slimmedMessages = slimMessagesForSummary(
      compactablePrefix,
      options.tools,
    );
    const prompt = buildCompactionPrompt(slimmedMessages);
    const summary = await generateCompactionSummary({config, prompt});
    const summaryMessage: LlmMessage = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      role: 'user',
      content: `<conversation_summary>\n${summary}\n</conversation_summary>`,
    };

    this.messages.length = 0;
    this.messages.push(summaryMessage, ...rawSuffix);
    this.compactions.push({
      id: crypto.randomUUID(),
      compactedAt: Date.now(),
      strategyVersion: COMPACTION_STRATEGY_VERSION,
      coveredMessageCount: compactablePrefix.length,
      rawSuffixCount: rawSuffix.length,
      beforeCharCount,
      afterCharCount: JSON.stringify(this.messages).length,
    });

    return true;
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
    try {
      await this.compactIfNeededUnlocked({
        reason: 'before-llm-call',
        tools,
        systemPrompt,
        thinkingLevel,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to compact LLM session before model call: ${message}`,
        {cause: error},
      );
    }
    const llmConfig = await this.getConfig();
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
            inputTokens: this.usage.inputTokens + event.usage.inputTokens,
            outputTokens: this.usage.outputTokens + event.usage.outputTokens,
            cacheReadInputTokens:
              this.usage.cacheReadInputTokens +
              event.usage.cacheReadInputTokens,
          };
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
