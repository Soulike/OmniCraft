import assert from 'node:assert';
import crypto from 'node:crypto';

import type {ThinkingLevel} from '@omnicraft/api-schema';
import type {
  SseDoneEvent,
  SseMessageStartEvent,
  SseTextDeltaEvent,
  SseUsage,
} from '@omnicraft/sse-events';

import {
  Agent,
  type AgentEventStream,
  type AgentSnapshot,
} from '@/agent-core/agent/index.js';
import type {LlmConfig} from '@/agent-core/llm-api/index.js';

interface ClaudeSdkIterationUsage {
  readonly type: string;
  readonly input_tokens: number;
  readonly cache_read_input_tokens: number;
  readonly cache_creation_input_tokens: number;
}

interface ClaudeSdkTokenUsage {
  readonly input_tokens: number | null;
  readonly cache_read_input_tokens?: number | null;
  readonly cache_creation_input_tokens?: number | null;
  readonly iterations?: readonly ClaudeSdkIterationUsage[] | null;
}

function createEmptyUsage(thinkingLevel: ThinkingLevel): SseUsage {
  return {
    model: 'claude-code',
    contextWindowTokens: 0,
    currentContextInputTokens: 0,
    sessionInputTokens: 0,
    sessionOutputTokens: 0,
    sessionCacheReadInputTokens: 0,
    thinkingLevel,
  };
}

function totalInputTokensFromClaudeUsage(usage: ClaudeSdkTokenUsage): number {
  const messageIterations =
    usage.iterations?.filter((iteration) => iteration.type === 'message') ?? [];
  const latestMessageUsage = messageIterations.at(-1);
  return (
    (latestMessageUsage?.input_tokens ?? usage.input_tokens ?? 0) +
    (latestMessageUsage?.cache_read_input_tokens ??
      usage.cache_read_input_tokens ??
      0) +
    (latestMessageUsage?.cache_creation_input_tokens ??
      usage.cache_creation_input_tokens ??
      0)
  );
}

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

  private usage: SseUsage;

  constructor(workingDirectory: string, snapshot?: AgentSnapshot) {
    const thinkingLevel = snapshot?.options.thinkingLevel ?? 'none';
    super(
      noopConfig,
      {
        toolRegistries: [],
        skillRegistries: [],
        baseSystemPrompt: '',
        getMaxToolRounds: () => 0,
        thinkingLevel,
        workingDirectory,
      },
      snapshot,
    );

    this.cwd = snapshot?.options.workingDirectory ?? workingDirectory;
    this.claudeCodeSessionId = snapshot?.options.claudeCodeSessionId;
    if (snapshot) {
      assert(
        snapshot.options.claudeCodeUsage,
        'CodingSubAgent snapshot is missing claudeCodeUsage',
      );
      this.usage = snapshot.options.claudeCodeUsage;
    } else {
      this.usage = createEmptyUsage(thinkingLevel);
    }
  }

  override toSnapshot(): AgentSnapshot {
    const base = super.toSnapshot();
    return {
      ...base,
      options: {
        ...base.options,
        claudeCodeSessionId: this.claudeCodeSessionId,
        claudeCodeUsage: this.usage,
      },
    };
  }

  protected override async *runAgentLoop(
    userMessage: string,
    thinkingLevel: ThinkingLevel,
    signal: AbortSignal,
  ): AgentEventStream {
    // Dynamic import to avoid loading the SDK when no coding subagent is used.
    const {query} = await import('@anthropic-ai/claude-agent-sdk');

    yield {
      type: 'message-start',
      role: 'user',
      messageId: crypto.randomUUID(),
      createdAt: Date.now(),
      content: userMessage,
    } satisfies SseMessageStartEvent;

    const sdkAbortController = new AbortController();
    if (signal.aborted) {
      sdkAbortController.abort();
    } else {
      signal.addEventListener(
        'abort',
        () => {
          sdkAbortController.abort();
        },
        {
          once: true,
        },
      );
    }

    let resultText = '';
    this.usage = {...this.usage, thinkingLevel};
    let currentContextInputTokens: number | undefined;

    const messageStream = query({
      prompt: userMessage,
      options: {
        cwd: this.cwd,
        abortController: sdkAbortController,
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        includePartialMessages: true,
        ...(this.claudeCodeSessionId ? {resume: this.claudeCodeSessionId} : {}),
      },
    });

    for await (const message of messageStream) {
      // Capture session ID from the init message for future resumption.
      if (message.type === 'system' && message.subtype === 'init') {
        this.claudeCodeSessionId = message.session_id;
      }

      // Stream text deltas from partial messages for real-time frontend display.
      if (message.type === 'stream_event') {
        const event = message.event;

        if (event.type === 'message_start') {
          currentContextInputTokens = totalInputTokensFromClaudeUsage(
            event.message.usage,
          );
        }

        if (event.type === 'content_block_start') {
          if (event.content_block.type === 'text') {
            yield {
              type: 'message-start',
              role: 'assistant',
              messageId: crypto.randomUUID(),
              createdAt: Date.now(),
              content: '',
            } satisfies SseMessageStartEvent;
          }

          if (event.content_block.type === 'tool_use') {
            yield {
              type: 'text-delta',
              content: `\n[Tool: ${event.content_block.name}]\n`,
            } satisfies SseTextDeltaEvent;
          }
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
        const entries = Object.entries(message.modelUsage);
        assert(entries.length > 0, 'Expected at least one model in modelUsage');
        const [model, modelUsage] = entries[0];
        this.usage = {
          model,
          contextWindowTokens: modelUsage.contextWindow,
          currentContextInputTokens:
            currentContextInputTokens ?? modelUsage.inputTokens,
          sessionInputTokens:
            this.usage.sessionInputTokens + modelUsage.inputTokens,
          sessionOutputTokens:
            this.usage.sessionOutputTokens + modelUsage.outputTokens,
          sessionCacheReadInputTokens:
            this.usage.sessionCacheReadInputTokens +
            modelUsage.cacheReadInputTokens,
          thinkingLevel,
        };

        if (message.subtype === 'success') {
          resultText = message.result;
        } else {
          // The throw prevents the `done` event from being yielded, so the
          // frontend will not receive usage data for failed invocations.
          // This matches the general subagent behavior — the dispatch tool's
          // catch block emits `subagent-complete` and returns a failure result.
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
        content: '',
      } satisfies SseMessageStartEvent;

      yield {
        type: 'text-delta',
        content: resultText,
      } satisfies SseTextDeltaEvent;
    }

    yield {
      type: 'done',
      reason: signal.aborted ? 'aborted' : 'complete',
      usage: this.usage,
    } satisfies SseDoneEvent;
  }
}
