import crypto from 'node:crypto';

import type {LlmConfig, LlmToolCall} from '@/api/llm/index.js';
import {eventBus} from '@/events/index.js';
import type {
  LlmSessionEventStream,
  LlmSessionTextDeltaEvent,
  ToolResult,
} from '@/models/llm-session/index.js';
import {LlmSession} from '@/models/llm-session/index.js';
import {LlmSessionStore} from '@/models/llm-session-store/index.js';
import {settingsService} from '@/services/settings/index.js';
import type {SkillDefinition, SkillRegistry} from '@/skills/index.js';
import type {
  ToolDefinition,
  ToolExecutionContext,
  ToolRegistry,
} from '@/tools/index.js';
import {loadSkillTool} from '@/tools/index.js';

// ---------------------------------------------------------------------------
// Agent Event Types
// ---------------------------------------------------------------------------

/** The agent has started executing a tool call. */
export interface AgentToolExecuteStartEvent {
  type: 'tool-execute-start';
  callId: string;
  toolName: string;
  arguments: string;
}

/** The agent has finished executing a tool call. */
export interface AgentToolExecuteEndEvent {
  type: 'tool-execute-end';
  callId: string;
  result: string;
  isError: boolean;
}

/** The agent has finished processing a user message. */
export interface AgentDoneEvent {
  type: 'done';
  reason: 'complete' | 'max_rounds_reached';
}

/** All events that the agent can yield to callers. */
export type AgentEvent =
  | LlmSessionTextDeltaEvent
  | AgentToolExecuteStartEvent
  | AgentToolExecuteEndEvent
  | AgentDoneEvent;

/** An async generator that yields agent streaming events. */
export type AgentEventStream = AsyncGenerator<AgentEvent, void, undefined>;

// ---------------------------------------------------------------------------
// Agent Options
// ---------------------------------------------------------------------------

interface AgentOptions {
  readonly toolRegistries: ToolRegistry[];
  readonly skillRegistries: SkillRegistry[];
  readonly baseSystemPrompt: string;
}

// ---------------------------------------------------------------------------
// Agent Base Class
// ---------------------------------------------------------------------------

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

  /** The id of the LLM session used by this agent. */
  readonly llmSessionId: string;

  /** Cached LLM session instance, lazily resolved from the store. */
  private cachedLlmSession: LlmSession | null = null;

  private readonly toolRegistries: readonly ToolRegistry[];
  private readonly skillRegistries: readonly SkillRegistry[];
  private readonly baseSystemPrompt: string;

  constructor(getConfig: () => Promise<LlmConfig>, options: AgentOptions) {
    this.id = crypto.randomUUID();
    this.toolRegistries = options.toolRegistries;
    this.skillRegistries = options.skillRegistries;
    this.baseSystemPrompt = options.baseSystemPrompt;

    const llmSession = new LlmSession(getConfig);
    this.llmSessionId = llmSession.id;
    eventBus.emit('agent-created', this);
  }

  /** Resolves the LLM session from the store, caching the result. */
  private getLlmSession(): LlmSession {
    if (!this.cachedLlmSession) {
      const session = LlmSessionStore.getInstance().get(this.llmSessionId);
      if (!session) {
        throw new Error(`LLM session not found: ${this.llmSessionId}`);
      }
      this.cachedLlmSession = session;
    }
    return this.cachedLlmSession;
  }

  /**
   * Handles a user message by running the full Agent Loop.
   *
   * Streams LLM responses, executes tool calls, and repeats until
   * the LLM produces no tool calls or the maximum round limit is reached.
   */
  async *handleUserMessage(userMessage: string): AgentEventStream {
    const settings = await settingsService.getAll();
    const maxRounds = settings.agent.maxToolRounds;

    const llmSession = this.getLlmSession();

    let tools = this.getAvailableTools();
    let systemPrompt = this.buildSystemPrompt();

    const toolCalls: LlmToolCall[] = [];
    yield* this.consumeStream(
      llmSession.sendUserMessage(userMessage, tools, systemPrompt),
      toolCalls,
    );

    let round = 0;
    while (toolCalls.length > 0) {
      round += 1;
      if (round > maxRounds) {
        yield {type: 'done', reason: 'max_rounds_reached'};
        return;
      }

      // Re-fetch tools and system prompt each round to pick up dynamic changes.
      tools = this.getAvailableTools();
      systemPrompt = this.buildSystemPrompt();

      const toolResults = yield* this.executeToolCalls(toolCalls, tools);

      toolCalls.length = 0;
      yield* this.consumeStream(
        llmSession.submitToolResults(toolResults, tools, systemPrompt),
        toolCalls,
      );
    }

    yield {type: 'done', reason: 'complete'};
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Merges tools from all registries, deduplicates by reference identity.
   * Adds the built-in `load_skill` tool when skills are available.
   * Throws if two different tool instances share the same name.
   */
  private getAvailableTools(): ToolDefinition[] {
    const toolMap = new Map<string, ToolDefinition>();

    for (const registry of this.toolRegistries) {
      for (const tool of registry.getAll()) {
        const existing = toolMap.get(tool.name);
        if (existing) {
          if (existing === tool) continue;
          throw new Error(
            `Duplicate tool name "${tool.name}" from different sources`,
          );
        }
        toolMap.set(tool.name, tool);
      }
    }

    const skills = this.getAvailableSkills();
    if (skills.length > 0) {
      const existing = toolMap.get(loadSkillTool.name);
      if (existing) {
        if (existing !== loadSkillTool) {
          throw new Error(
            `Duplicate tool name "${loadSkillTool.name}" from different sources`,
          );
        }
      } else {
        toolMap.set(loadSkillTool.name, loadSkillTool);
      }
    }

    return [...toolMap.values()];
  }

  /**
   * Merges skills from all registries, deduplicates by reference identity.
   * Throws if two different skill instances share the same name.
   */
  private getAvailableSkills(): SkillDefinition[] {
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

    return [...skillMap.values()];
  }

  /**
   * Combines the base system prompt with a skill catalog section
   * listing all available skills.
   */
  private buildSystemPrompt(): string {
    const skills = this.getAvailableSkills();
    if (skills.length === 0) return this.baseSystemPrompt;

    const skillLines = skills
      .map((skill) => `- ${skill.name}: ${skill.description}`)
      .join('\n');

    const skillSection = [
      '',
      '## Available Skills',
      '',
      'Use the load_skill tool to load the full instructions for a skill before using it.',
      '',
      skillLines,
    ].join('\n');

    return this.baseSystemPrompt + skillSection;
  }

  /**
   * Consumes an LLM event stream, yielding text-delta events to the caller
   * and collecting tool-call events into the provided mutable array.
   */
  private async *consumeStream(
    stream: LlmSessionEventStream,
    toolCalls: LlmToolCall[],
  ): AgentEventStream {
    for await (const event of stream) {
      if (event.type === 'text-delta') {
        yield event;
      } else {
        toolCalls.push(event.toolCall);
      }
    }
  }

  /**
   * Executes all collected tool calls, yielding start/end events for each.
   * Returns the tool results array for submission to the LLM.
   */
  private async *executeToolCalls(
    toolCalls: readonly LlmToolCall[],
    tools: readonly ToolDefinition[],
  ): AsyncGenerator<
    AgentToolExecuteStartEvent | AgentToolExecuteEndEvent,
    ToolResult[],
    undefined
  > {
    const context: ToolExecutionContext = {
      availableSkills: this.getAvailableSkills(),
    };

    const toolMap = new Map<string, ToolDefinition>();
    for (const tool of tools) {
      toolMap.set(tool.name, tool);
    }

    const results: ToolResult[] = [];

    for (const toolCall of toolCalls) {
      yield {
        type: 'tool-execute-start',
        callId: toolCall.callId,
        toolName: toolCall.toolName,
        arguments: toolCall.arguments,
      };

      try {
        const tool = toolMap.get(toolCall.toolName);
        if (!tool) {
          throw new Error(`Unknown tool: ${toolCall.toolName}`);
        }

        const parsedArgs: unknown = tool.parameters.parse(
          JSON.parse(toolCall.arguments),
        );
        const result = await tool.execute(parsedArgs, context);

        yield {
          type: 'tool-execute-end',
          callId: toolCall.callId,
          result,
          isError: false,
        };

        results.push({callId: toolCall.callId, content: result});
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);

        yield {
          type: 'tool-execute-end',
          callId: toolCall.callId,
          result: message,
          isError: true,
        };

        results.push({callId: toolCall.callId, content: message});
      }
    }

    return results;
  }
}
