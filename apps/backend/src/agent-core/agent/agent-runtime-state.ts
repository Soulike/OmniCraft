import type {SseSubAgentEvent} from '@omnicraft/sse-events';

import type {LlmConfig} from '../llm-api/index.js';
import type {SkillDefinition} from '../skill/index.js';
import type {
  ShellState,
  TodoState,
  ToolExecutionContext,
} from '../tool/index.js';
import {UserInteractionBridge} from '../user-interaction/index.js';
import {FileContentCache} from './state/file-content-cache.js';
import {FileStatTracker} from './state/file-stat-tracker.js';
import type {SubagentRegistry} from './state/subagent-registry.js';
import {type TodoItem, TodoStore} from './state/todo-store.js';

export interface BuildToolExecutionContextInput {
  readonly callId: string;
  readonly agentId: string;
  readonly sessionsDir: string | null;
  readonly subagentRegistry: SubagentRegistry;
  readonly availableSkills: ReadonlyMap<string, SkillDefinition>;
  readonly workingDirectory: string;
  readonly signal: AbortSignal;
  readonly onSubAgentEvent: (event: SseSubAgentEvent) => void;
  readonly getConfig: () => Promise<LlmConfig>;
  readonly getLightConfig: () => Promise<LlmConfig>;
}

export class AgentRuntimeState {
  private readonly fileCache = new FileContentCache();
  private readonly fileStatTracker = new FileStatTracker();
  private readonly shellState: ShellState;
  private readonly userInteractionBridge = new UserInteractionBridge();
  private readonly todoStore = new TodoStore();
  private readonly todoState: TodoState = {lastObservedVersion: undefined};
  private readonly lastStopCheckTokens = new Map<string, string>();

  constructor(workingDirectory: string) {
    this.shellState = {cwd: workingDirectory};
  }

  get todoVersion(): number {
    return this.todoStore.version;
  }

  listTodos(): TodoItem[] {
    return this.todoStore.list();
  }

  /** Returns the state token a stop-check last reminded on, or undefined. */
  getLastStopCheckToken(checkName: string): string | undefined {
    return this.lastStopCheckTokens.get(checkName);
  }

  /** Records the state token a stop-check just reminded on. */
  recordStopCheckToken(checkName: string, token: string): void {
    this.lastStopCheckTokens.set(checkName, token);
  }

  submitUserResponse(id: string, result: unknown): boolean {
    return this.userInteractionBridge.submitResponse(id, result);
  }

  buildToolExecutionContext(
    input: BuildToolExecutionContextInput,
  ): ToolExecutionContext {
    return {
      callId: input.callId,
      agentId: input.agentId,
      sessionsDir: input.sessionsDir,
      subagentRegistry: input.subagentRegistry,
      availableSkills: input.availableSkills,
      workingDirectory: input.workingDirectory,
      fileCache: this.fileCache,
      fileStatTracker: this.fileStatTracker,
      shellState: this.shellState,
      signal: input.signal,
      onSubAgentEvent: input.onSubAgentEvent,
      userInteractionBridge: this.userInteractionBridge,
      todoStore: this.todoStore,
      todoState: this.todoState,
      getConfig: input.getConfig,
      getLightConfig: input.getLightConfig,
    };
  }
}
