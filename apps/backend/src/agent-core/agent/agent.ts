import crypto from 'node:crypto';
import os from 'node:os';

import {agentEventBus} from '../events/index.js';
import type {LlmConfig, LlmToolCall} from '../llm-api/index.js';
import type {
  LlmSessionEventStream,
  LlmSessionTextDeltaEvent,
  ToolResult,
} from '../llm-session/index.js';
import {LlmSession} from '../llm-session/index.js';
import type {SkillDefinition} from '../skill/index.js';
import type {
  AllowedPath,
  ToolDefinition,
  ToolExecutionContext,
} from '../tool/index.js';
import {loadSkillTool} from '../tool/index.js';
import type {ToolSetDefinition} from '../tool-set/index.js';
import {loadToolSetTool} from '../tool-set/index.js';
import {FileContentCache} from './file-content-cache.js';
import type {
  AgentDoneEvent,
  AgentEventStream,
  AgentOptions,
  AgentSnapshot,
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

  private readonly toolRegistries: AgentOptions['toolRegistries'];
  private readonly toolSetRegistries: AgentOptions['toolSetRegistries'];
  private readonly skillRegistries: AgentOptions['skillRegistries'];
  private readonly baseSystemPrompt: string;
  private readonly getMaxToolRounds: AgentOptions['getMaxToolRounds'];

  private readonly workingDirectory: string;

  private readonly extraAllowedPaths: readonly AllowedPath[];

  /** LRU file content cache, shared by all file-related tools. */
  private readonly fileCache = new FileContentCache();

  /** Tool sets loaded into this agent session via the `load_toolset` tool. */
  private readonly loadedToolSets = new Set<ToolSetDefinition>();

  constructor(
    getConfig: () => Promise<LlmConfig>,
    options: AgentOptions,
    snapshot?: AgentSnapshot,
  ) {
    this.toolRegistries = options.toolRegistries;
    this.toolSetRegistries = options.toolSetRegistries;
    this.skillRegistries = options.skillRegistries;
    this.baseSystemPrompt = options.baseSystemPrompt;
    this.getMaxToolRounds = options.getMaxToolRounds;

    this.extraAllowedPaths = [
      {path: os.tmpdir(), mode: 'read-write' as const},
      ...options.extraAllowedPaths,
    ];

    if (snapshot) {
      this.id = snapshot.id;
      this.workingDirectory = snapshot.options.workingDirectory;
      this.llmSession = new LlmSession(getConfig, snapshot.llmSession);
    } else {
      this.id = crypto.randomUUID();
      this.workingDirectory = options.workingDirectory;
      this.llmSession = new LlmSession(getConfig);
    }

    agentEventBus.emit('agent-created', this);
  }

  /** Returns a serializable snapshot of this agent. */
  toSnapshot(): AgentSnapshot {
    return {
      id: this.id,
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
    signal?: AbortSignal,
  ): AgentEventStream {
    const maxRounds = await this.getMaxToolRounds();

    let toolCalls = yield* this.consumeStream(
      this.llmSession.sendUserMessage(
        userMessage,
        [...this.getAvailableTools().values()],
        this.buildSystemPrompt(),
        signal,
      ),
    );

    let round = 0;
    while (toolCalls.length > 0) {
      if (signal?.aborted) return;

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
        if (signal?.aborted) return;

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
          signal,
        ),
      );
    }

    yield {type: 'done', reason: 'complete'} satisfies AgentDoneEvent;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Merges tools from all registries and loaded tool sets, deduplicates by
   * reference identity. Adds built-in `load_skill` / `load_toolset` tools
   * when skills / tool sets are available.
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

    for (const toolSet of this.loadedToolSets) {
      for (const tool of toolSet.getAll()) {
        addTool(tool, `tool set "${toolSet.name}"`);
      }
    }

    const skills = this.getAvailableSkills();
    if (skills.size > 0) {
      addTool(loadSkillTool, 'built-in');
    }

    const toolSets = this.getAvailableToolSets();
    if (toolSets.size > 0) {
      addTool(loadToolSetTool, 'built-in');
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
   * Merges tool sets from all registries, deduplicates by reference identity.
   * Throws if two different tool set instances share the same name.
   */
  private getAvailableToolSets(): ReadonlyMap<string, ToolSetDefinition> {
    const toolSetMap = new Map<string, ToolSetDefinition>();

    for (const registry of this.toolSetRegistries) {
      for (const toolSet of registry.getAll()) {
        const existing = toolSetMap.get(toolSet.name);
        if (existing) {
          if (existing === toolSet) continue;
          throw new Error(
            `Duplicate tool set name "${toolSet.name}" from different sources`,
          );
        }
        toolSetMap.set(toolSet.name, toolSet);
      }
    }

    return toolSetMap;
  }

  /**
   * Combines the base system prompt with catalog sections listing
   * all available skills and tool sets.
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

    const toolSets = this.getAvailableToolSets();
    if (toolSets.size > 0) {
      const toolSetLines = [...toolSets.values()]
        .map((ts) => `- ${ts.name}: ${ts.description}`)
        .join('\n');

      prompt += [
        '',
        '## Available ToolSets',
        '',
        `Use the ${loadToolSetTool.name} tool to load a set of tools when needed.`,
        '',
        toolSetLines,
      ].join('\n');
    }

    prompt += `\n\nWorking directory: ${this.workingDirectory}\nYou can only access files within this directory.`;

    return prompt;
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
      availableToolSets: this.getAvailableToolSets(),
      loadedToolSets: this.loadedToolSets,
      loadToolSetToAgent: (toolSet) => {
        this.loadedToolSets.add(toolSet);
      },
      workingDirectory: this.workingDirectory,
      fileCache: this.fileCache,
      extraAllowedPaths: this.extraAllowedPaths,
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
