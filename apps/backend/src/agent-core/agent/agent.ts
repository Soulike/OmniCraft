import crypto from 'node:crypto';
import os from 'node:os';

import type {ThinkingLevel} from '@omnicraft/api-schema';
import type {
  SseDoneEvent,
  SseMessageStartEvent,
  SseSubAgentEvent,
  SseTextDeltaEvent,
  SseThinkingDeltaEvent,
  SseThinkingEndEvent,
  SseThinkingStartEvent,
  SseToolExecuteDeltaEvent,
  SseToolExecuteEndEvent,
  SseToolExecuteStartEvent,
  SseUsage,
} from '@omnicraft/sse-events';
import type {AnyToolResultData, ToolName} from '@omnicraft/tool-schemas';

import {AsyncChannel} from '@/helpers/async-channel.js';

import {agentEventBus} from '../events/index.js';
import type {LlmConfig, LlmToolCall} from '../llm-api/index.js';
import type {LlmSessionEventStream, ToolResult} from '../llm-session/index.js';
import {LlmSession} from '../llm-session/index.js';
import {modelCapacity} from '../model-capacity/index.js';
import type {SkillDefinition} from '../skill/index.js';
import type {
  AllowedPathEntry,
  ShellState,
  ToolDefinition,
  ToolExecutionContext,
} from '../tool/index.js';
import {loadSkillTool} from '../tool/index.js';
import {FileContentCache} from './file-content-cache.js';
import {FileStatTracker} from './file-stat-tracker.js';
import type {AgentEventStream, AgentOptions, AgentSnapshot} from './types.js';

/**
 * Base class for all agents.
 *
 * Implements the full Agent Loop: send user message → stream LLM response →
 * execute tool calls → submit results → repeat until done or max rounds.
 *
 * Subclasses only differ in what they pass to `super()`.
 */
export abstract class Agent {
  /** Unique identifier for this agent session. */
  readonly id: string;

  /** Short title for this session, generated after the first reply. */
  title = '';

  /** The LLM session used by this agent. */
  private readonly llmSession: LlmSession;

  private readonly toolRegistries: AgentOptions['toolRegistries'];
  private readonly skillRegistries: AgentOptions['skillRegistries'];
  private readonly baseSystemPrompt: string;
  private readonly getMaxToolRounds: AgentOptions['getMaxToolRounds'];
  private readonly getConfig: () => Promise<LlmConfig>;

  private readonly workingDirectory: string;

  private readonly extraAllowedPaths: readonly AllowedPathEntry[];

  /** LRU file content cache, shared by all file-related tools. */
  private readonly fileCache = new FileContentCache();

  /** Tracks file stats for modification safety checks. */
  private readonly fileStatTracker = new FileStatTracker();

  /** Mutable shell state, shared by shell-related tools. */
  private readonly shellState: ShellState;

  constructor(
    getConfig: () => Promise<LlmConfig>,
    options: AgentOptions,
    snapshot?: AgentSnapshot,
  ) {
    this.toolRegistries = options.toolRegistries;
    this.skillRegistries = options.skillRegistries;
    this.baseSystemPrompt = options.baseSystemPrompt;
    this.getMaxToolRounds = options.getMaxToolRounds;
    this.getConfig = getConfig;

    this.extraAllowedPaths = [
      {path: os.tmpdir(), mode: 'read-write' as const},
      ...options.extraAllowedPaths,
    ];

    if (snapshot) {
      this.id = snapshot.id;
      this.title = snapshot.title;
      this.workingDirectory = snapshot.options.workingDirectory;
      this.llmSession = new LlmSession(getConfig, snapshot.llmSession);
    } else {
      this.id = crypto.randomUUID();
      this.workingDirectory = options.workingDirectory;
      this.llmSession = new LlmSession(getConfig);
    }

    this.shellState = {cwd: this.workingDirectory};

    agentEventBus.emit('agent-created', this);
  }

  /** Returns a serializable snapshot of this agent. */
  toSnapshot(): AgentSnapshot {
    return {
      id: this.id,
      title: this.title,
      llmSession: this.llmSession.toSnapshot(),
      options: {
        workingDirectory: this.workingDirectory,
      },
    };
  }

  /**
   * Handles a user message by running the full Agent Loop.
   *
   * Streams LLM responses, executes tool calls, and repeats until
   * the LLM produces no tool calls or the maximum round limit is reached.
   */
  async *handleUserMessage(
    userMessage: string,
    thinkingLevel: ThinkingLevel,
    signal: AbortSignal,
  ): AgentEventStream {
    const maxRounds = await this.getMaxToolRounds();

    const {
      stream: userStream,
      messageId,
      createdAt,
    } = this.llmSession.sendUserMessage(
      userMessage,
      [...this.getAvailableTools().values()],
      this.buildSystemPrompt(),
      thinkingLevel,
      signal,
    );

    yield {
      type: 'message-start',
      role: 'user',
      messageId,
      createdAt,
    } satisfies SseMessageStartEvent;

    let toolCalls = yield* this.consumeStream(userStream);

    let round = 0;
    while (toolCalls.length > 0) {
      if (signal.aborted) return;

      round++;
      if (round > maxRounds) {
        yield {
          type: 'done',
          reason: 'max_rounds_reached',
          usage: await this.buildSseUsage(),
        } satisfies SseDoneEvent;
        return;
      }

      const availableTools = this.getAvailableTools();

      // Emit all tool-execute-start events up front (skip suppressed tools)
      for (const toolCall of toolCalls) {
        const tool = availableTools.get(toolCall.toolName);
        if (tool?.suppressToolEvents) continue;
        yield {
          type: 'tool-execute-start',
          callId: toolCall.callId,
          // Safe to assert: unknown tool names are handled in executeTool
          toolName: toolCall.toolName as ToolName,
          displayName: tool?.displayName ?? toolCall.toolName,
          arguments: toolCall.arguments,
        } satisfies SseToolExecuteStartEvent;
      }

      // Execute all tools in parallel, streaming end events as each completes
      const toolSseEventChannel = new AsyncChannel<
        SseToolExecuteEndEvent | SseToolExecuteDeltaEvent | SseSubAgentEvent
      >();
      const toolResults = new Map<string, ToolResult>();

      const executions = toolCalls.map(async (toolCall) => {
        const result = await this.executeTool(
          toolCall,
          availableTools,
          toolSseEventChannel,
          signal,
        );

        const tool = availableTools.get(toolCall.toolName);
        if (!tool?.suppressToolEvents) {
          toolSseEventChannel.push({
            type: 'tool-execute-end' as const,
            callId: toolCall.callId,
            result: result.content,
            status: result.status,
            data: result.data,
          } satisfies SseToolExecuteEndEvent);
        }

        toolResults.set(toolCall.callId, {
          callId: toolCall.callId,
          content: result.content,
        });
      });

      void Promise.all(executions)
        .catch(() => {
          // Individual tool errors are already handled by executeTool.
          // This catch prevents an unhandled rejection from hanging the channel.
        })
        .finally(() => {
          toolSseEventChannel.close();
        });

      for await (const event of toolSseEventChannel) {
        yield event;
      }

      // signal.aborted may have changed during async tool execution
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (signal.aborted) return;

      // Submit results in the same order as the original tool calls
      const orderedResults = toolCalls.flatMap((tc) => {
        const result = toolResults.get(tc.callId);
        return result ? [result] : [];
      });

      toolCalls = yield* this.consumeStream(
        this.llmSession.submitToolResults(
          orderedResults,
          [...this.getAvailableTools().values()],
          this.buildSystemPrompt(),
          thinkingLevel,
          signal,
        ),
      );
    }

    yield {
      type: 'done',
      reason: 'complete',
      usage: await this.buildSseUsage(),
    } satisfies SseDoneEvent;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Builds the full SseUsage object by combining LLM session token counts
   * with model metadata from the config.
   */
  private async buildSseUsage(): Promise<SseUsage> {
    const config = await this.getConfig();
    const maxInputTokens = await modelCapacity.getMaxInputTokens(config);
    return {
      model: config.model,
      maxInputTokens,
      ...this.llmSession.getUsage(),
    };
  }

  /**
   * Merges tools from all registries, deduplicates by reference identity.
   * Adds built-in `load_skill` tool when skills are available.
   * Throws if two different tool instances share the same name.
   */
  private getAvailableTools(): ReadonlyMap<string, ToolDefinition> {
    const toolMap = new Map<string, ToolDefinition>();

    const addTool = (tool: ToolDefinition, source: string): void => {
      const existing = toolMap.get(tool.name);
      if (existing) {
        if (existing === tool) return;
        throw new Error(
          `Duplicate tool name "${tool.name}" from different sources (${source})`,
        );
      }
      toolMap.set(tool.name, tool);
    };

    for (const registry of this.toolRegistries) {
      for (const tool of registry.getAll()) {
        addTool(tool, 'tool registry');
      }
    }

    const skills = this.getAvailableSkills();
    if (skills.size > 0) {
      addTool(loadSkillTool, 'built-in');
    }

    return toolMap;
  }

  /**
   * Merges skills from all registries, deduplicates by reference identity.
   * Throws if two different skill instances share the same name.
   */
  private getAvailableSkills(): ReadonlyMap<string, SkillDefinition> {
    const skillMap = new Map<string, SkillDefinition>();

    for (const registry of this.skillRegistries) {
      for (const skill of registry.getAll()) {
        const existing = skillMap.get(skill.name);
        if (existing) {
          if (existing === skill) continue;
          throw new Error(
            `Duplicate skill name "${skill.name}" from different sources`,
          );
        }
        skillMap.set(skill.name, skill);
      }
    }

    return skillMap;
  }

  /**
   * Combines the base system prompt with catalog sections listing
   * all available skills.
   */
  private buildSystemPrompt(): string {
    let prompt = this.baseSystemPrompt;

    const skills = this.getAvailableSkills();
    if (skills.size > 0) {
      const skillLines = [...skills.values()]
        .map((skill) => `- ${skill.name}: ${skill.description}`)
        .join('\n');

      prompt += [
        '',
        '## Available Skills',
        '',
        `Use the ${loadSkillTool.name} tool to load the full instructions for a skill before using it.`,
        '',
        skillLines,
      ].join('\n');
    }

    prompt += `\n\nWorking directory: ${this.workingDirectory}\nYou can read and write files within this directory.`;
    prompt +=
      "\nWhen executing shell commands, do not access any files outside your working directory and other allowed paths unless it's necessary to finish your job or user explicitly requests it.";

    if (this.extraAllowedPaths.length > 0) {
      const pathLines = this.extraAllowedPaths
        .map((p) => `- ${p.path} (${p.mode})`)
        .join('\n');
      prompt += `\n\nAdditional accessible paths:\n${pathLines}`;
    }

    return prompt;
  }

  /**
   * Consumes an LLM event stream, yielding text, thinking, and
   * message-start events to the caller and collecting tool-call events.
   * Returns the collected tool calls.
   */
  private async *consumeStream(
    stream: LlmSessionEventStream,
  ): AsyncGenerator<
    | SseTextDeltaEvent
    | SseThinkingStartEvent
    | SseThinkingDeltaEvent
    | SseThinkingEndEvent
    | SseMessageStartEvent,
    LlmToolCall[],
    undefined
  > {
    const toolCalls: LlmToolCall[] = [];
    for await (const event of stream) {
      switch (event.type) {
        case 'text-delta':
        case 'thinking-start':
        case 'thinking-delta':
        case 'thinking-end':
          yield event;
          break;
        case 'message-start':
          yield {
            type: 'message-start',
            role: 'assistant',
            messageId: event.messageId,
            createdAt: event.createdAt,
          } satisfies SseMessageStartEvent;
          break;
        case 'tool-call':
          toolCalls.push(event.toolCall);
          break;
      }
    }
    return toolCalls;
  }

  /**
   * Executes a single tool call. Returns the result content and execution status.
   * Assembles onOutput and onSubAgentEvent callbacks from the channel.
   */
  private async executeTool(
    toolCall: LlmToolCall,
    availableTools: ReadonlyMap<string, ToolDefinition>,
    toolSseEventChannel: AsyncChannel<
      SseToolExecuteEndEvent | SseToolExecuteDeltaEvent | SseSubAgentEvent
    >,
    signal: AbortSignal,
  ): Promise<{
    content: string;
    status: 'success' | 'failure' | 'error';
    data: AnyToolResultData;
  }> {
    const tool = availableTools.get(toolCall.toolName);
    if (!tool) {
      const message = `Unknown tool: ${toolCall.toolName}`;
      return {content: `Error: ${message}`, status: 'error', data: {message}};
    }

    const onOutput = tool.suppressToolEvents
      ? undefined
      : (chunk: string) => {
          toolSseEventChannel.push({
            type: 'tool-execute-delta',
            callId: toolCall.callId,
            content: chunk,
          } satisfies SseToolExecuteDeltaEvent);
        };

    const context: ToolExecutionContext = {
      availableSkills: this.getAvailableSkills(),
      workingDirectory: this.workingDirectory,
      fileCache: this.fileCache,
      fileStatTracker: this.fileStatTracker,
      extraAllowedPaths: this.extraAllowedPaths,
      shellState: this.shellState,
      signal,
      onSubAgentEvent: (event) => {
        toolSseEventChannel.push(event);
      },
    };

    try {
      const parsedArgs: unknown = tool.parameters.parse(
        JSON.parse(toolCall.arguments),
      );
      const result = await tool.execute(parsedArgs, context, onOutput);
      return {
        content: result.content,
        status: result.status,
        data: result.data as AnyToolResultData,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return {content: `Error: ${message}`, status: 'error', data: {message}};
    }
  }
}
