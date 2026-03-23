import crypto from 'node:crypto';

import type {
  LlmAssistantMessage,
  LlmConfig,
  LlmMessage,
  LlmToolCall,
  LlmUsage,
} from '@/api/llm/index.js';
import {llmApi} from '@/api/llm/index.js';
import {eventBus} from '@/events/index.js';
import {Mutex} from '@/helpers/mutex.js';

import type {LlmSessionEventStream, ToolResult} from './types.js';

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
  private readonly systemPrompt: string;
  private readonly mutex = new Mutex();

  constructor(getConfig: () => Promise<LlmConfig>, systemPrompt = '') {
    this.id = crypto.randomUUID();
    this.getConfig = getConfig;
    this.systemPrompt = systemPrompt;
    eventBus.emit('llm-session-created', this);
  }

  /**
   * Sends a user message to the LLM and returns a high-level event stream.
   *
   * Yields `text-delta` events for real-time streaming, then `tool-call`
   * events with fully assembled tool calls (if any). Once fully consumed,
   * the user message and assistant reply are recorded in the history.
   */
  async *sendMessage(content: string): LlmSessionEventStream {
    const release = await this.mutex.acquire();
    const rollbackIndex = this.messages.length;
    this.messages.push({role: 'user', content});
    try {
      yield* this.callLlm();
    } catch (e) {
      this.messages.length = rollbackIndex;
      throw e;
    } finally {
      release();
    }
  }

  /**
   * Submits tool execution results and continues the LLM conversation.
   *
   * Records each tool result in the history, then calls the LLM so it
   * can incorporate the results. Returns the same high-level event stream
   * as `sendMessage`.
   */
  async *submitToolResults(results: ToolResult[]): LlmSessionEventStream {
    const release = await this.mutex.acquire();
    const rollbackIndex = this.messages.length;
    for (const result of results) {
      this.messages.push({
        role: 'tool',
        callId: result.callId,
        content: result.content,
      });
    }
    try {
      yield* this.callLlm();
    } catch (e) {
      this.messages.length = rollbackIndex;
      throw e;
    } finally {
      release();
    }
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
   * Calls the LLM with the current message history and yields high-level events.
   * Assembles the assistant message and records it in the history when done.
   */
  private async *callLlm(): LlmSessionEventStream {
    const llmConfig = await this.getConfig();
    const eventStream = llmApi.streamCompletion({
      config: llmConfig,
      messages: this.messages,
      systemPrompt: this.systemPrompt || undefined,
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
