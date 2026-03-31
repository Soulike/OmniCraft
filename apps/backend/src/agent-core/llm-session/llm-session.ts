import crypto from 'node:crypto';

import {Mutex} from '@/helpers/mutex.js';

import {agentEventBus} from '../events/index.js';
import type {
  LlmAssistantMessage,
  LlmConfig,
  LlmMessage,
  LlmToolCall,
  LlmUsage,
} from '../llm-api/index.js';
import {llmApi} from '../llm-api/index.js';
import type {ToolDefinition} from '../tool/types.js';
import type {
  LlmSessionEventStream,
  LlmSessionSnapshot,
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
  private usage: LlmUsage = {inputTokens: 0, outputTokens: 0};
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
    } else {
      this.id = crypto.randomUUID();
    }

    agentEventBus.emit('llm-session-created', this);
  }

  /** Returns a serializable snapshot of this session. */
  toSnapshot(): LlmSessionSnapshot {
    return {id: this.id, messages: [...this.messages]};
  }

  /**
   * Sends a user message to the LLM and returns a high-level event stream.
   *
   * Yields `text-delta` events for real-time streaming, then `tool-call`
   * events with fully assembled tool calls (if any). Once fully consumed,
   * the user message and assistant reply are recorded in the history.
   */
  async *sendUserMessage(
    content: string,
    tools: readonly ToolDefinition[],
    systemPrompt: string,
  ): LlmSessionEventStream {
    yield* this.sendMessages([{role: 'user', content}], tools, systemPrompt);
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
  ): LlmSessionEventStream {
    const toolMessages: LlmMessage[] = results.map((result) => ({
      role: 'tool' as const,
      callId: result.callId,
      content: result.content,
    }));
    yield* this.sendMessages(toolMessages, tools, systemPrompt);
  }

  /** Returns the accumulated token usage across all LLM calls in this session. */
  getUsage(): LlmUsage {
    return {...this.usage};
  }

  /** Returns a shallow copy of the full message history. */
  getMessages(): LlmMessage[] {
    return [...this.messages];
  }

  /** Clears all messages and resets usage. */
  clear(): void {
    this.messages.length = 0;
    this.usage = {inputTokens: 0, outputTokens: 0};
  }

  /**
   * Appends messages to history, streams a completion from the LLM, and
   * rolls back if the stream is cancelled or errors. Serialized via mutex.
   */
  private async *sendMessages(
    messages: LlmMessage[],
    tools: readonly ToolDefinition[],
    systemPrompt: string,
  ): LlmSessionEventStream {
    const release = await this.mutex.acquire();
    const rollbackIndex = this.messages.length;
    this.messages.push(...messages);
    let completed = false;
    try {
      yield* this.streamCompletion(tools, systemPrompt);
      completed = true;
    } finally {
      if (!completed) {
        this.messages.length = rollbackIndex;
      }
      release();
    }
  }

  /**
   * Streams a completion from the LLM using the current message history.
   * Yields text deltas in real-time, then fully assembled tool calls.
   * Records the assistant message in history when done.
   */
  private async *streamCompletion(
    tools: readonly ToolDefinition[],
    systemPrompt: string,
  ): LlmSessionEventStream {
    const llmConfig = await this.getConfig();
    const eventStream = llmApi.streamCompletion({
      config: llmConfig,
      messages: this.messages,
      systemPrompt: systemPrompt || undefined,
      tools,
    });

    let textContent = '';
    const toolCalls: LlmToolCall[] = [];
    const pendingToolCalls = new Map<string, LlmToolCall>();

    for await (const event of eventStream) {
      switch (event.type) {
        case 'text-delta':
          textContent += event.content;
          yield {type: 'text-delta', content: event.content};
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
          };
          break;
        case 'message-start':
          break;
      }
    }

    for (const toolCall of toolCalls) {
      yield {type: 'tool-call', toolCall};
    }

    const assistantMessage: LlmAssistantMessage = {
      role: 'assistant',
      content: textContent,
      toolCalls,
    };
    this.messages.push(assistantMessage);
  }
}
