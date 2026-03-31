import crypto from 'node:crypto';

import {agentEventBus} from '../events/index.js';
import type {LlmConfig, LlmToolCall} from '../llm-api/index.js';
import type {
  LlmSessionEventStream,
  LlmSessionTextDeltaEvent,
  ToolResult,
} from '../llm-session/index.js';
import {LlmSession} from '../llm-session/index.js';
import type {SkillDefinition} from '../skill/index.js';
import type {ToolDefinition, ToolExecutionContext} from '../tool/index.js';
import {loadSkillTool} from '../tool/index.js';
import type {
  AgentDoneEvent,
  AgentEventStream,
  AgentOptions,
  AgentToolExecuteEndEvent,
  AgentToolExecuteStartEvent,
} from './types.js';

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

  /** The LLM session used by this agent. */
  private readonly llmSession: LlmSession;

  /** The id of the LLM session used by this agent. */
  get llmSessionId(): string {
    return this.llmSession.id;
  }

  private readonly toolRegistries: AgentOptions['toolRegistries'];
  private readonly skillRegistries: AgentOptions['skillRegistries'];
  private readonly baseSystemPrompt: string;
  private readonly getMaxToolRounds: AgentOptions['getMaxToolRounds'];

  constructor(getConfig: () => Promise<LlmConfig>, options: AgentOptions) {
    this.id = crypto.randomUUID();
    this.toolRegistries = options.toolRegistries;
    this.skillRegistries = options.skillRegistries;
    this.baseSystemPrompt = options.baseSystemPrompt;
    this.getMaxToolRounds = options.getMaxToolRounds;

    this.llmSession = new LlmSession(getConfig);
    agentEventBus.emit('agent-created', this);
  }

  /**
   * Handles a user message by running the full Agent Loop.
   *
   * Streams LLM responses, executes tool calls, and repeats until
   * the LLM produces no tool calls or the maximum round limit is reached.
   */
  async *handleUserMessage(userMessage: string): AgentEventStream {
    const maxRounds = await this.getMaxToolRounds();

    let toolCalls = yield* this.consumeStream(
      this.llmSession.sendUserMessage(
        userMessage,
        [...this.getAvailableTools().values()],
        this.buildSystemPrompt(),
      ),
    );

    let round = 0;
    while (toolCalls.length > 0) {
      round++;
      if (round > maxRounds) {
        yield {
          type: 'done',
          reason: 'max_rounds_reached',
        } satisfies AgentDoneEvent;
        return;
      }

      const availableTools = this.getAvailableTools();
      const toolResults: ToolResult[] = [];

      for (const toolCall of toolCalls) {
        const tool = availableTools.get(toolCall.toolName);
        yield {
          type: 'tool-execute-start',
          callId: toolCall.callId,
          toolName: toolCall.toolName,
          displayName: tool?.displayName ?? toolCall.toolName,
          arguments: toolCall.arguments,
        } satisfies AgentToolExecuteStartEvent;

        const result = await this.executeTool(toolCall, availableTools);

        yield {
          type: 'tool-execute-end',
          callId: toolCall.callId,
          result: result.content,
          isError: result.isError,
        } satisfies AgentToolExecuteEndEvent;

        toolResults.push({callId: toolCall.callId, content: result.content});
      }

      toolCalls = yield* this.consumeStream(
        this.llmSession.submitToolResults(
          toolResults,
          [...this.getAvailableTools().values()],
          this.buildSystemPrompt(),
        ),
      );
    }

    yield {type: 'done', reason: 'complete'} satisfies AgentDoneEvent;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Merges tools from all registries, deduplicates by reference identity.
   * Adds the built-in `load_skill` tool when skills are available.
   * Throws if two different tool instances share the same name.
   */
  private getAvailableTools(): ReadonlyMap<string, ToolDefinition> {
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

    return toolMap;
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
      `Use the ${loadSkillTool.name} tool to load the full instructions for a skill before using it.`,
      '',
      skillLines,
    ].join('\n');

    return this.baseSystemPrompt + skillSection;
  }

  /**
   * Consumes an LLM event stream, yielding text-delta events to the caller
   * and collecting tool-call events. Returns the collected tool calls.
   */
  private async *consumeStream(
    stream: LlmSessionEventStream,
  ): AsyncGenerator<LlmSessionTextDeltaEvent, LlmToolCall[], undefined> {
    const toolCalls: LlmToolCall[] = [];
    for await (const event of stream) {
      if (event.type === 'text-delta') {
        yield event;
      } else {
        toolCalls.push(event.toolCall);
      }
    }
    return toolCalls;
  }

  /**
   * Executes a single tool call. Returns the result content and whether it errored.
   */
  private async executeTool(
    toolCall: LlmToolCall,
    availableTools: ReadonlyMap<string, ToolDefinition>,
  ): Promise<{content: string; isError: boolean}> {
    const tool = availableTools.get(toolCall.toolName);
    if (!tool) {
      return {
        content: `Error: Unknown tool: ${toolCall.toolName}`,
        isError: true,
      };
    }

    const context: ToolExecutionContext = {
      availableSkills: this.getAvailableSkills(),
    };

    try {
      const parsedArgs: unknown = tool.parameters.parse(
        JSON.parse(toolCall.arguments),
      );
      const content = await tool.execute(parsedArgs, context);
      return {content, isError: false};
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return {content: `Error: ${message}`, isError: true};
    }
  }
}
