import crypto from 'node:crypto';

import type {ThinkingLevel} from '@omnicraft/api-schema';
import type {AllowedPathEntry} from '@omnicraft/settings-schema';
import type {
  SseDoneEvent,
  SseMessageStartEvent,
  SseTextDeltaEvent,
  SseUsage,
} from '@omnicraft/sse-events';

import {Agent} from '@/agent-core/agent/index.js';
import type {
  AgentEventStream,
  AgentSnapshot,
} from '@/agent-core/agent/types.js';
import type {LlmConfig} from '@/agent-core/llm-api/index.js';

/** Minimal config for the unused base-class LLM session. */
const noopConfig = (): Promise<LlmConfig> =>
  Promise.resolve({
    apiFormat: 'claude' as const,
    apiKey: '',
    baseUrl: '',
    model: '',
  });

/**
 * Coding subagent powered by Claude Agent SDK (Claude Code).
 *
 * Unlike GeneralSubAgent, this agent delegates entirely to an external
 * Claude Code process. The Agent base class's LLM loop is never used;
 * {@link handleUserMessage} is overridden to call the Claude Agent SDK's
 * `query()` function instead.
 *
 * The SDK session ID is captured on first run and can be persisted via
 * {@link toSnapshot} so that future calls to {@link handleUserMessage}
 * resume the same Claude Code conversation.
 */
export class CodingSubAgent extends Agent {
  /**
   * Stored separately because the base class field is private.
   * Used to pass `cwd` to the Claude Agent SDK.
   */
  private readonly cwd: string;

  /** Claude Agent SDK session ID, captured from the init message. */
  private claudeCodeSessionId: string | undefined;

  constructor(
    workingDirectory: string,
    extraAllowedPaths: readonly AllowedPathEntry[] = [],
    snapshot?: AgentSnapshot,
  ) {
    super(
      noopConfig,
      {
        toolRegistries: [],
        skillRegistries: [],
        baseSystemPrompt: '',
        getMaxToolRounds: () => 0,
        workingDirectory,
        extraAllowedPaths,
      },
      snapshot,
    );

    this.cwd = snapshot?.options.workingDirectory ?? workingDirectory;
    this.claudeCodeSessionId = snapshot?.options.claudeCodeSessionId;
  }

  override toSnapshot(): AgentSnapshot {
    const base = super.toSnapshot();
    return {
      ...base,
      options: {
        ...base.options,
        claudeCodeSessionId: this.claudeCodeSessionId,
      },
    };
  }

  override async *handleUserMessage(
    userMessage: string,
    _thinkingLevel: ThinkingLevel,
    signal: AbortSignal,
  ): AgentEventStream {
    // Dynamic import to avoid loading the SDK when no coding subagent is used.
    const {query} = await import('@anthropic-ai/claude-agent-sdk');

    const abortController = new AbortController();
    const onAbort = (): void => {
      abortController.abort();
    };
    if (signal.aborted) {
      abortController.abort();
    } else {
      signal.addEventListener('abort', onAbort, {once: true});
    }

    try {
      let resultText = '';
      let usage: SseUsage = {
        model: 'claude-code',
        maxInputTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadInputTokens: 0,
      };

      for await (const message of query({
        prompt: userMessage,
        options: {
          cwd: this.cwd,
          abortController,
          permissionMode: 'bypassPermissions',
          allowDangerouslySkipPermissions: true,
          includePartialMessages: true,
          ...(this.claudeCodeSessionId
            ? {resume: this.claudeCodeSessionId}
            : {}),
        },
      })) {
        // Capture session ID from the init message for future resumption.
        if (message.type === 'system' && message.subtype === 'init') {
          this.claudeCodeSessionId = message.session_id;
        }

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

        // Capture result and usage from SDK completion.
        if (message.type === 'result') {
          const [model, modelUsage] = Object.entries(message.modelUsage)[0];
          usage = {
            model,
            maxInputTokens: modelUsage.contextWindow,
            inputTokens: modelUsage.inputTokens,
            outputTokens: modelUsage.outputTokens,
            cacheReadInputTokens: modelUsage.cacheReadInputTokens,
          };

          if (message.subtype === 'success') {
            resultText = message.result;
          } else {
            // Surface SDK errors so the dispatch tool can report them.
            const errors = message.errors.join('; ');
            throw new Error(
              `Coding agent failed (${message.subtype}): ${errors || 'unknown error'}`,
            );
          }
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
        usage,
      } satisfies SseDoneEvent;
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
  }
}
