import crypto from 'node:crypto';

import type {ThinkingLevel} from '@omnicraft/api-schema';
import type {AllowedPathEntry} from '@omnicraft/settings-schema';
import type {
  SseDoneEvent,
  SseMessageStartEvent,
  SseTextDeltaEvent,
} from '@omnicraft/sse-events';

import {Agent} from '@/agent-core/agent/index.js';
import type {AgentEventStream} from '@/agent-core/agent/types.js';
import type {LlmConfig} from '@/agent-core/llm-api/index.js';

/**
 * Coding subagent powered by Claude Agent SDK (Claude Code).
 *
 * Unlike GeneralSubAgent, this agent delegates entirely to an external
 * Claude Code process. The Agent base class's LLM loop is never used;
 * {@link handleUserMessage} is overridden to call the Claude Agent SDK's
 * `query()` function instead.
 */
export class CodingSubAgent extends Agent {
  /**
   * Stored separately because the base class field is private.
   * Used to pass `cwd` to the Claude Agent SDK.
   */
  private readonly cwd: string;

  constructor(
    workingDirectory: string,
    extraAllowedPaths: readonly AllowedPathEntry[] = [],
  ) {
    // Minimal config — the base class LLM session is never used.
    const noopConfig = (): Promise<LlmConfig> =>
      Promise.resolve({
        apiFormat: 'claude' as const,
        apiKey: '',
        baseUrl: '',
        model: '',
      });

    super(noopConfig, {
      toolRegistries: [],
      skillRegistries: [],
      baseSystemPrompt: '',
      getMaxToolRounds: () => 0,
      workingDirectory,
      extraAllowedPaths,
    });

    this.cwd = workingDirectory;
  }

  override async *handleUserMessage(
    userMessage: string,
    _thinkingLevel: ThinkingLevel,
    signal: AbortSignal,
  ): AgentEventStream {
    const {query} = await import('@anthropic-ai/claude-agent-sdk');

    const abortController = new AbortController();
    signal.addEventListener('abort', () => {
      abortController.abort();
    });

    let resultText = '';

    for await (const message of query({
      prompt: userMessage,
      options: {
        cwd: this.cwd,
        abortController,
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        includePartialMessages: true,
      },
    })) {
      // Stream text deltas from partial messages for real-time frontend display.
      if (message.type === 'stream_event') {
        const event = message.event;

        if (
          event.type === 'content_block_start' &&
          event.content_block.type === 'text'
        ) {
          yield {
            type: 'message-start',
            role: 'assistant',
            messageId: crypto.randomUUID(),
            createdAt: Date.now(),
          } satisfies SseMessageStartEvent;
        }

        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          yield {
            type: 'text-delta',
            content: event.delta.text,
          } satisfies SseTextDeltaEvent;
        }
      }

      // Emit tool use summaries as text so the frontend shows tool activity.
      if (message.type === 'tool_use_summary') {
        yield {
          type: 'text-delta',
          content: `\n${message.summary}\n`,
        } satisfies SseTextDeltaEvent;
      }

      // Capture the final result text from a successful completion.
      if (message.type === 'result' && message.subtype === 'success') {
        resultText = message.result;
      }
    }

    // Yield the clean result as the final assistant message so that the
    // dispatch tool's `lastReplyText` accumulator ends up with just the
    // summary, not all intermediate streaming text.
    if (resultText) {
      yield {
        type: 'message-start',
        role: 'assistant',
        messageId: crypto.randomUUID(),
        createdAt: Date.now(),
      } satisfies SseMessageStartEvent;

      yield {
        type: 'text-delta',
        content: resultText,
      } satisfies SseTextDeltaEvent;
    }

    yield {
      type: 'done',
      reason: 'complete',
      usage: {
        model: 'claude-code',
        maxInputTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadInputTokens: 0,
      },
    } satisfies SseDoneEvent;
  }
}
