# Subagent Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist dispatched regular subagents by reusing the existing `Agent` snapshot, metadata, and SSE log persistence flow.

**Architecture:** Add parent persistence context to tool execution, compute a child `subagents` sessions directory in `dispatch_agent`, and pass that directory into `GeneralSubAgent` and `ExploreSubAgent`. No subagent store, custom metadata, resume API, frontend change, or snapshot schema change is introduced.

**Tech Stack:** TypeScript, Bun, Vitest, Node.js `fs/promises`, existing OmniCraft `Agent` persistence.

---

## File Structure

- `apps/backend/src/agent-core/tool/types.ts` owns the shared `ToolExecutionContext`; add parent agent persistence fields here.
- `apps/backend/src/agent-core/tool/testing.ts` creates mock tool contexts; add defaults for the new fields so existing tests remain in-memory.
- `apps/backend/src/agent-core/agent/agent.ts` builds the runtime `ToolExecutionContext`; populate the new fields from the current `Agent` instance.
- `apps/backend/src/agent/agents/general-sub-agent/general-sub-agent.ts` constructs the general subagent; accept optional `sessionsDir` and pass it to `Agent`.
- `apps/backend/src/agent/agents/explore-sub-agent/explore-sub-agent.ts` constructs the explore subagent; accept optional `sessionsDir` and pass it to `Agent`.
- `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts` computes the child sessions directory and forwards it through `createSubAgent()`.
- `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.test.ts` verifies the directory helper and constructor-level persistence.

---

### Task 1: Add Parent Persistence Fields to Tool Context

**Files:**

- Modify: `apps/backend/src/agent-core/tool/types.ts`
- Modify: `apps/backend/src/agent-core/tool/testing.ts`
- Modify: `apps/backend/src/agent-core/agent/agent.ts`

- [ ] **Step 1: Update the `ToolExecutionContext` type**

In `apps/backend/src/agent-core/tool/types.ts`, add `agentId` and `sessionsDir` immediately after `callId`:

```typescript
/** Execution context provided by the Agent to each Tool at call time. */
export interface ToolExecutionContext {
  /** The unique call ID for this tool invocation, from the LLM API response. */
  readonly callId: string;

  /** The parent Agent's unique ID. */
  readonly agentId: string;

  /** Directory where the parent Agent persists sessions, or null for in-memory agents. */
  readonly sessionsDir: string | null;

  /** All skills available to the current Agent, merged and deduplicated. */
  readonly availableSkills: ReadonlyMap<string, SkillDefinition>;

  /** The Agent's working directory. File tools resolve relative paths against this. */
  readonly workingDirectory: string;
```

Leave the rest of the interface unchanged.

- [ ] **Step 2: Update mock tool contexts**

In `apps/backend/src/agent-core/tool/testing.ts`, add defaults to the object returned by `createMockContext()`:

```typescript
return {
  callId: 'mock-call-id',
  agentId: 'mock-agent-id',
  sessionsDir: null,
  availableSkills: new Map(),
  workingDirectory,
  fileCache: new FileContentCache(),
  fileStatTracker: new FileStatTracker(),
  shellState: {cwd: workingDirectory},
  signal: new AbortController().signal,
  onSubAgentEvent: () => {
    // noop — mock context ignores subagent events
  },
  userInteractionBridge: new UserInteractionBridge(),
  todoStore: new TodoStore(),
  todoState: {lastObservedVersion: undefined},
  getConfig: () =>
    Promise.resolve({
      apiFormat: 'claude' as const,
      apiKey: '',
      baseUrl: 'https://api.anthropic.com',
      model: 'mock-model',
    }),
  getLightConfig: () =>
    Promise.resolve({
      apiFormat: 'claude' as const,
      apiKey: '',
      baseUrl: 'https://api.anthropic.com',
      model: 'mock-light-model',
    }),
  ...overrides,
};
```

- [ ] **Step 3: Populate the fields in production tool context**

In `apps/backend/src/agent-core/agent/agent.ts`, update the `context` object inside `executeTool()` so the top fields are:

```typescript
const context: ToolExecutionContext = {
  callId: toolCall.callId,
  agentId: this.id,
  sessionsDir: this.sessionsDir,
  availableSkills: buildAvailableSkills(this.skillRegistries),
  workingDirectory: this.workingDirectory,
  fileCache: this.fileCache,
  fileStatTracker: this.fileStatTracker,
  shellState: this.shellState,
  signal,
  onSubAgentEvent: (event) => {
    toolSseEventChannel.push(event);
  },
  userInteractionBridge: this.userInteractionBridge,
  todoStore: this.todoStore,
  todoState: this.todoState,
  getConfig: this.getConfig,
  getLightConfig: this.getLightConfig ?? this.getConfig,
};
```

- [ ] **Step 4: Run typecheck to verify the shared context change**

Run:

```bash
bun run --filter '@omnicraft/backend' typecheck
```

Expected: PASS. If it fails, every error should point to a direct `ToolExecutionContext` object literal that needs the same `agentId` and `sessionsDir` defaults.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/agent-core/tool/types.ts \
  apps/backend/src/agent-core/tool/testing.ts \
  apps/backend/src/agent-core/agent/agent.ts
git commit -m "feat(agent): expose persistence context to tools"
```

---

### Task 2: Pass Optional Sessions Directory Through Subagent Construction

**Files:**

- Modify: `apps/backend/src/agent/agents/general-sub-agent/general-sub-agent.ts`
- Modify: `apps/backend/src/agent/agents/explore-sub-agent/explore-sub-agent.ts`
- Modify: `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts`
- Modify: `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.test.ts`

- [ ] **Step 1: Add failing tests for sessions directory path and persistence**

In `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.test.ts`, update the import from `dispatch-agent-tool.js` to include the path helper:

```typescript
import {
  createSubAgent,
  dispatchAgentTool,
  getSubagentSessionsDir,
  SUB_AGENT_TYPE,
} from './dispatch-agent-tool.js';
```

Add these tests inside `describe('dispatchAgentTool', () => { ... })`, after the existing factory behavior tests and before `describe('workingDirectory boundary check', ...)`:

```typescript
it('computes a child sessions directory from parent persistence context', () => {
  const parentSessionsDir = path.join(tmpDir, 'coding-sessions');
  const result = getSubagentSessionsDir(
    createMockContext({
      agentId: 'parent-agent-id',
      sessionsDir: parentSessionsDir,
    }),
  );

  expect(result).toBe(
    path.join(parentSessionsDir, 'parent-agent-id', 'subagents'),
  );
});

it('keeps subagents in memory when parent has no sessions directory', () => {
  const result = getSubagentSessionsDir(createMockContext({sessionsDir: null}));

  expect(result).toBeUndefined();
});

it('persists a general subagent when sessionsDir is provided', async () => {
  resetAgentRegistries();
  initAgentRegistries();
  try {
    const sessionsDir = path.join(tmpDir, 'subagents');
    const subagent = createSubAgent(
      SUB_AGENT_TYPE.GENERAL,
      context.getConfig,
      tmpDir,
      sessionsDir,
    );

    const snapshotContent = await fs.readFile(
      path.join(sessionsDir, subagent.id, 'snapshot.json'),
      'utf-8',
    );
    const metadataContent = await fs.readFile(
      path.join(sessionsDir, subagent.id, 'metadata.json'),
      'utf-8',
    );
    const snapshot: unknown = JSON.parse(snapshotContent);
    const metadata: unknown = JSON.parse(metadataContent);

    expect(snapshot).toMatchObject({
      id: subagent.id,
      title: 'New Session',
      sseEventCount: 0,
      llmSession: {messages: []},
      options: {workingDirectory: tmpDir},
    });
    expect(metadata).toEqual({
      id: subagent.id,
      title: 'New Session',
      workingDirectory: tmpDir,
    });
  } finally {
    resetAgentRegistries();
  }
});

it('persists an explore subagent when sessionsDir is provided', async () => {
  resetAgentRegistries();
  initAgentRegistries();
  try {
    const sessionsDir = path.join(tmpDir, 'subagents');
    const subagent = createSubAgent(
      SUB_AGENT_TYPE.EXPLORE,
      context.getConfig,
      tmpDir,
      sessionsDir,
    );

    const snapshotContent = await fs.readFile(
      path.join(sessionsDir, subagent.id, 'snapshot.json'),
      'utf-8',
    );
    const metadataContent = await fs.readFile(
      path.join(sessionsDir, subagent.id, 'metadata.json'),
      'utf-8',
    );
    const snapshot: unknown = JSON.parse(snapshotContent);
    const metadata: unknown = JSON.parse(metadataContent);

    expect(snapshot).toMatchObject({
      id: subagent.id,
      title: 'New Session',
      sseEventCount: 0,
      llmSession: {messages: []},
      options: {workingDirectory: tmpDir},
    });
    expect(metadata).toEqual({
      id: subagent.id,
      title: 'New Session',
      workingDirectory: tmpDir,
    });
  } finally {
    resetAgentRegistries();
  }
});
```

- [ ] **Step 2: Run targeted test and verify it fails**

Run:

```bash
bun run --filter '@omnicraft/backend' test -- src/agent/tools/sub-agent/dispatch-agent-tool.test.ts
```

Expected: FAIL because `getSubagentSessionsDir` is not exported and `createSubAgent()` does not accept `sessionsDir` yet.

- [ ] **Step 3: Update `GeneralSubAgent` constructor**

In `apps/backend/src/agent/agents/general-sub-agent/general-sub-agent.ts`, change the constructor signature and include `sessionsDir` in the `AgentOptions` object:

```typescript
export class GeneralSubAgent extends Agent {
  constructor(
    getConfig: () => Promise<LlmConfig>,
    workingDirectory: string,
    sessionsDir?: string,
  ) {
    super(getConfig, {
      toolRegistries: [
        CoreToolRegistry.getInstance(),
        FileToolRegistry.getInstance(),
        WebToolRegistry.getInstance(),
        BashToolRegistry.getInstance(),
      ],
      skillRegistries: [CoreSkillRegistry.getInstance()],
      baseSystemPrompt:
        'You are a helpful assistant working on a delegated subtask. ' +
        'After completing your task, provide a concise summary of what you did and the results.',
      getMaxToolRounds: async () => {
        const settings = await settingsService.getAll();
        return settings.agent.maxToolRounds;
      },
      workingDirectory,
      sessionsDir,
    });
  }
}
```

- [ ] **Step 4: Update `ExploreSubAgent` constructor**

In `apps/backend/src/agent/agents/explore-sub-agent/explore-sub-agent.ts`, change the constructor signature and include `sessionsDir` in the `AgentOptions` object:

```typescript
export class ExploreSubAgent extends Agent {
  constructor(
    getConfig: () => Promise<LlmConfig>,
    workingDirectory: string,
    sessionsDir?: string,
  ) {
    super(getConfig, {
      toolRegistries: [
        CoreToolRegistry.getInstance(),
        FileToolRegistry.getInstance(),
        WebToolRegistry.getInstance(),
        BashToolRegistry.getInstance(),
      ],
      skillRegistries: [CoreSkillRegistry.getInstance()],
      baseSystemPrompt: exploreSubAgentSystemPrompt,
      getMaxToolRounds: async () => {
        const settings = await settingsService.getAll();
        return settings.agent.maxToolRounds;
      },
      workingDirectory,
      sessionsDir,
    });
  }
}
```

- [ ] **Step 5: Update `dispatch-agent-tool.ts` factory and helper**

In `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts`, replace `createSubAgent()` with this version and add `getSubagentSessionsDir()` immediately after it:

```typescript
export function createSubAgent(
  agentType: SubAgentType,
  getConfig: () => Promise<LlmConfig>,
  workingDirectory: string,
  sessionsDir?: string,
): Agent {
  switch (agentType) {
    case SUB_AGENT_TYPE.GENERAL:
      return new GeneralSubAgent(getConfig, workingDirectory, sessionsDir);
    case SUB_AGENT_TYPE.EXPLORE:
      return new ExploreSubAgent(getConfig, workingDirectory, sessionsDir);
  }
}

export function getSubagentSessionsDir(
  context: ToolExecutionContext,
): string | undefined {
  if (!context.sessionsDir) return undefined;
  return path.join(context.sessionsDir, context.agentId, 'subagents');
}
```

Then update the subagent construction inside `dispatchAgentTool.execute()`:

```typescript
// Create subagent
const subagentSessionsDir = getSubagentSessionsDir(context);
const subagent = createSubAgent(
  agentType,
  getConfig,
  workingDirectory,
  subagentSessionsDir,
);
```

- [ ] **Step 6: Run targeted test and verify it passes**

Run:

```bash
bun run --filter '@omnicraft/backend' test -- src/agent/tools/sub-agent/dispatch-agent-tool.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run backend typecheck**

Run:

```bash
bun run --filter '@omnicraft/backend' typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/agent/agents/general-sub-agent/general-sub-agent.ts \
  apps/backend/src/agent/agents/explore-sub-agent/explore-sub-agent.ts \
  apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts \
  apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.test.ts
git commit -m "feat(agent): persist dispatched subagents"
```

---

### Task 3: Final Verification

**Files:**

- No code changes expected.

- [ ] **Step 1: Run the full backend test suite**

Run:

```bash
bun run --filter '@omnicraft/backend' test
```

Expected: PASS.

- [ ] **Step 2: Run backend typecheck again**

Run:

```bash
bun run --filter '@omnicraft/backend' typecheck
```

Expected: PASS.

- [ ] **Step 3: Inspect final diff**

Run:

```bash
git status --short
git log --oneline -3
```

Expected: working tree is clean after the two implementation commits, and the latest commits are the context-field change and the subagent persistence change.

---

## Self-Review

- Spec coverage: The plan persists regular dispatched subagents by passing `sessionsDir`; saves the existing `snapshot.json`, `metadata.json`, and `sse-events.jsonl`; avoids custom metadata, stores, resume tools, frontend routes, and snapshot schema changes.
- Placeholder scan: No open placeholders are required for implementation. The plan uses exact file paths, code blocks, commands, and expected outcomes.
- Type consistency: `sessionsDir` remains `string | null` in `ToolExecutionContext`, `string | undefined` when passed into constructors, and `AgentOptions.sessionsDir?: string` accepts the resulting value.
