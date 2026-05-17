# Live Subagent Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace persisted subagent records with a parent-owned live registry and rename listing to `list_resumable_agents`.

**Architecture:** `SubagentRegistry` becomes an in-memory LRU registry that stores live `Agent` instances, type, title, and running state. Parent `AgentSnapshot` no longer contains `subagents`; persisted subagent files remain as dispatch artifacts only. `list_resumable_agents` reads only the live registry and never touches subagent metadata or snapshots.

**Tech Stack:** TypeScript, Vitest, Zod, Bun workspace scripts, existing `Agent`/tool registry abstractions.

---

## File Structure

- Rewrite: `apps/backend/src/agent-core/agent/state/subagent-registry.ts`
  - Owns live subagent entries and LRU eviction.
  - Exports `DEFAULT_MAX_LIVE_SUBAGENTS`, `LiveSubagentRecord`, `LiveSubagentHandle`, and `SubagentRegistry`.
- Rewrite: `apps/backend/src/agent-core/agent/state/subagent-registry.test.ts`
  - Covers live records, `get()`, running state, recency, eviction, active readers, and `clear()`.
- Modify: `apps/backend/src/agent-core/agent/types.ts`
  - Removes `subagents` from `agentSnapshotSchema` and `AgentSnapshot`.
- Modify: `apps/backend/src/agent-core/agent/agent.ts`
  - Constructs an empty live registry for new and restored agents.
  - Removes live registry data from `toSnapshot()`.
- Modify: `apps/backend/src/agent-core/agent/agent.test.ts`
  - Removes old persisted subagent snapshot tests and updates snapshot fixtures.
- Modify: `apps/backend/src/agent-core/agent/persistence/agent-persistence.test.ts`
  - Removes `subagents` from test snapshots and deletes the missing-subagents default test.
- Delete: `apps/backend/src/agent/tools/sub-agent/list-agents-tool.ts`
- Delete: `apps/backend/src/agent/tools/sub-agent/list-agents-tool.test.ts`
- Create: `apps/backend/src/agent/tools/sub-agent/list-resumable-agents-tool.ts`
  - Implements `list_resumable_agents` from `context.subagentRegistry.list()`.
- Create: `apps/backend/src/agent/tools/sub-agent/list-resumable-agents-tool.test.ts`
  - Verifies name, registration, empty output, live output, running state, and no persistence reads.
- Modify: `apps/backend/src/agent/tools/sub-agent/sub-agent-tool-registry.ts`
  - Registers `listResumableAgentsTool` instead of `listAgentsTool`.
- Modify: `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts`
  - Calls `context.subagentRegistry.register(subagent, agentType)`.
- Modify: `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.test.ts`
  - Updates registration assertion to live record shape.

---

### Task 1: Rewrite `SubagentRegistry` As A Live LRU Registry

**Files:**

- Rewrite: `apps/backend/src/agent-core/agent/state/subagent-registry.ts`
- Rewrite: `apps/backend/src/agent-core/agent/state/subagent-registry.test.ts`

- [ ] **Step 1: Replace registry tests with live-registry expectations**

Replace `apps/backend/src/agent-core/agent/state/subagent-registry.test.ts` with:

```typescript
import crypto from 'node:crypto';

import {SubAgentType} from '@omnicraft/api-schema';
import {describe, expect, it} from 'vitest';

import type {Agent} from '../agent.js';
import {
  DEFAULT_MAX_LIVE_SUBAGENTS,
  SubagentRegistry,
} from './subagent-registry.js';

function createMockAgent(
  overrides: {
    id?: string;
    title?: string;
    isRunning?: boolean;
    activeReaderCount?: number;
  } = {},
): Agent {
  const agent = {
    id: overrides.id ?? crypto.randomUUID(),
    title: overrides.title ?? 'New Session',
    sseLog: {
      activeReaderCount: overrides.activeReaderCount ?? 0,
    },
  } as Agent;

  Object.defineProperty(agent, 'isRunning', {
    get: () => overrides.isRunning ?? false,
  });

  return agent;
}

describe('SubagentRegistry', () => {
  it('starts empty by default', () => {
    const registry = new SubagentRegistry();

    expect(registry.list()).toEqual([]);
  });

  it('uses ten entries as the default live limit', () => {
    expect(DEFAULT_MAX_LIVE_SUBAGENTS).toBe(10);
  });

  it('registers and returns a live subagent handle', () => {
    const registry = new SubagentRegistry();
    const agent = createMockAgent({title: 'Build Summary'});

    registry.register(agent, SubAgentType.GENERAL);

    expect(registry.get(agent.id)).toEqual({
      agent,
      agentType: SubAgentType.GENERAL,
    });
  });

  it('lists live records from the current agent instance', () => {
    const registry = new SubagentRegistry();
    const idle = createMockAgent({title: 'Build Summary'});
    const running = createMockAgent({title: 'Explore Report', isRunning: true});

    registry.register(idle, SubAgentType.GENERAL);
    registry.register(running, SubAgentType.EXPLORE);

    expect(registry.list()).toEqual([
      {
        id: idle.id,
        agentType: SubAgentType.GENERAL,
        title: 'Build Summary',
        isRunning: false,
      },
      {
        id: running.id,
        agentType: SubAgentType.EXPLORE,
        title: 'Explore Report',
        isRunning: true,
      },
    ]);
  });

  it('updates an existing live entry', () => {
    const registry = new SubagentRegistry();
    const first = createMockAgent();
    const replacement = createMockAgent({id: first.id, title: 'Replacement'});

    registry.register(first, SubAgentType.GENERAL);
    registry.register(replacement, SubAgentType.EXPLORE);

    expect(registry.get(first.id)).toEqual({
      agent: replacement,
      agentType: SubAgentType.EXPLORE,
    });
    expect(registry.list()).toEqual([
      {
        id: first.id,
        agentType: SubAgentType.EXPLORE,
        title: 'Replacement',
        isRunning: false,
      },
    ]);
  });

  it('rejects non-UUID ids during lookup', () => {
    const registry = new SubagentRegistry();

    expect(() => registry.get('not-a-uuid')).toThrow();
  });

  it('evicts the least recently used idle entry when capacity is exceeded', () => {
    const registry = new SubagentRegistry({maxEntries: 2});
    const first = createMockAgent({title: 'First'});
    const second = createMockAgent({title: 'Second'});
    const third = createMockAgent({title: 'Third'});

    registry.register(first, SubAgentType.GENERAL);
    registry.register(second, SubAgentType.EXPLORE);
    registry.get(first.id);
    registry.register(third, SubAgentType.GENERAL);

    expect(registry.get(first.id)?.agent).toBe(first);
    expect(registry.get(second.id)).toBeUndefined();
    expect(registry.get(third.id)?.agent).toBe(third);
  });

  it('does not evict running entries', () => {
    const registry = new SubagentRegistry({maxEntries: 1});
    const running = createMockAgent({isRunning: true});
    const idle = createMockAgent();

    registry.register(running, SubAgentType.GENERAL);
    registry.register(idle, SubAgentType.EXPLORE);

    expect(registry.get(running.id)?.agent).toBe(running);
    expect(registry.get(idle.id)?.agent).toBe(idle);
  });

  it('does not evict entries with active SSE readers', () => {
    const registry = new SubagentRegistry({maxEntries: 1});
    const reading = createMockAgent({activeReaderCount: 1});
    const idle = createMockAgent();

    registry.register(reading, SubAgentType.GENERAL);
    registry.register(idle, SubAgentType.EXPLORE);

    expect(registry.get(reading.id)?.agent).toBe(reading);
    expect(registry.get(idle.id)?.agent).toBe(idle);
  });

  it('clears live entries', () => {
    const registry = new SubagentRegistry();
    const agent = createMockAgent();

    registry.register(agent, SubAgentType.GENERAL);
    registry.clear();

    expect(registry.list()).toEqual([]);
    expect(registry.get(agent.id)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run registry tests to verify they fail**

Run:

```bash
bun --filter @omnicraft/backend test -- src/agent-core/agent/state/subagent-registry.test.ts
```

Expected: FAIL because `register()` still accepts persisted records, `DEFAULT_MAX_LIVE_SUBAGENTS` does not exist, and live handles are not implemented.

- [ ] **Step 3: Replace registry implementation**

Replace `apps/backend/src/agent-core/agent/state/subagent-registry.ts` with:

```typescript
import {subAgentTypeSchema, type SubAgentType} from '@omnicraft/api-schema';
import {z} from 'zod';

import type {Agent} from '../agent.js';

export const DEFAULT_MAX_LIVE_SUBAGENTS = 10;

const subagentIdSchema = z.uuid();

interface LiveSubagentRegistryEntry {
  readonly agent: Agent;
  readonly agentType: SubAgentType;
  lastAccessedAt: number;
}

export interface LiveSubagentRecord {
  readonly id: string;
  readonly agentType: SubAgentType;
  readonly title: string;
  readonly isRunning: boolean;
}

export interface LiveSubagentHandle {
  readonly agent: Agent;
  readonly agentType: SubAgentType;
}

interface SubagentRegistryOptions {
  readonly maxEntries?: number;
}

export class SubagentRegistry {
  private readonly records = new Map<string, LiveSubagentRegistryEntry>();
  private readonly maxEntries: number;
  private accessOrder = 0;

  constructor(options: SubagentRegistryOptions = {}) {
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_LIVE_SUBAGENTS;
  }

  register(agent: Agent, agentType: SubAgentType): void {
    const id = subagentIdSchema.parse(agent.id);
    const parsedAgentType = subAgentTypeSchema.parse(agentType);
    this.records.set(id, {
      agent,
      agentType: parsedAgentType,
      lastAccessedAt: this.nextAccessOrder(),
    });
    this.evictIfNeeded();
  }

  get(id: string): LiveSubagentHandle | undefined {
    const parsedId = subagentIdSchema.parse(id);
    const entry = this.records.get(parsedId);
    if (!entry) return undefined;

    entry.lastAccessedAt = this.nextAccessOrder();
    this.evictIfNeeded();
    return {agent: entry.agent, agentType: entry.agentType};
  }

  list(): LiveSubagentRecord[] {
    return [...this.records.values()].map((entry) => ({
      id: entry.agent.id,
      agentType: entry.agentType,
      title: entry.agent.title,
      isRunning: entry.agent.isRunning,
    }));
  }

  clear(): void {
    this.records.clear();
  }

  private nextAccessOrder(): number {
    this.accessOrder += 1;
    return this.accessOrder;
  }

  private evictIfNeeded(): void {
    if (this.records.size <= this.maxEntries) return;

    const entries = [...this.records.entries()]
      .filter(([, entry]) => this.isEvictable(entry))
      .sort((a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt);

    for (const [id] of entries) {
      if (this.records.size <= this.maxEntries) break;
      this.records.delete(id);
    }
  }

  private isEvictable(entry: LiveSubagentRegistryEntry): boolean {
    return !entry.agent.isRunning && entry.agent.sseLog.activeReaderCount === 0;
  }
}
```

- [ ] **Step 4: Run registry tests to verify they pass**

Run:

```bash
bun --filter @omnicraft/backend test -- src/agent-core/agent/state/subagent-registry.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit registry rewrite**

Run:

```bash
git add apps/backend/src/agent-core/agent/state/subagent-registry.ts apps/backend/src/agent-core/agent/state/subagent-registry.test.ts
git commit -m "refactor: make subagent registry live-only"
```

Expected: commit succeeds. The pre-commit hook formats and lints staged files; no extra format/lint command is needed solely because the hook ran.

---

### Task 2: Remove Subagents From Agent Snapshots

**Files:**

- Modify: `apps/backend/src/agent-core/agent/types.ts`
- Modify: `apps/backend/src/agent-core/agent/agent.ts`
- Modify: `apps/backend/src/agent-core/agent/agent.test.ts`
- Modify: `apps/backend/src/agent-core/agent/persistence/agent-persistence.test.ts`

- [ ] **Step 1: Update snapshot-related tests first**

In `apps/backend/src/agent-core/agent/agent.test.ts`, delete the helper `createSubagentRegisteringTool()` and delete these old tests from `describe('Agent snapshot restore', ...)`:

```typescript
it('includes subagent records in snapshots', async () => {
  // delete the entire test body
});

it('restores subagent records from snapshots', () => {
  // delete the entire test body
});
```

In the same file, remove `subagents: []` from every `AgentSnapshot` fixture. The fixture near the default working directory restore test should become:

```typescript
const snapshot: AgentSnapshot = {
  id,
  title: 'Restored Session',
  sseEventCount: 0,
  llmSession: {
    id: 'llm-session-id',
    messages: [],
    compactions: [],
    latestUsageInputMessageCount: null,
    usage: emptyUsage(),
  },
  options: {
    thinkingLevel: 'high',
  },
};
```

In `apps/backend/src/agent-core/agent/persistence/agent-persistence.test.ts`, update `createTestSnapshot()` to omit `subagents`:

```typescript
function createTestSnapshot(id: string): AgentSnapshot {
  return {
    id,
    title: 'Test Session',
    sseEventCount: 0,
    llmSession: {
      id: 'llm-session-id',
      messages: [],
      compactions: [],
      latestUsageInputMessageCount: null,
      usage: emptyUsage(),
    },
    options: {
      workingDirectory: '/tmp/test-working-dir',
      thinkingLevel: 'medium',
    },
  };
}
```

Delete this old persistence test completely:

```typescript
it('defaults missing subagents to an empty list', async () => {
  // delete the entire test body
});
```

Remove `subagents: []` from the invalid-thinking-level snapshot fixture in the same test file.

- [ ] **Step 2: Run snapshot tests to verify they fail**

Run:

```bash
bun --filter @omnicraft/backend test -- src/agent-core/agent/agent.test.ts src/agent-core/agent/persistence/agent-persistence.test.ts
```

Expected: FAIL with TypeScript or runtime failures because production snapshot types and `Agent.toSnapshot()` still include `subagents` and `Agent` still restores registry records from snapshots.

- [ ] **Step 3: Remove `subagents` from the snapshot schema and Agent implementation**

In `apps/backend/src/agent-core/agent/types.ts`, remove the `subagentRecordSchema` import and remove `subagents` from `agentSnapshotSchema`:

```typescript
import {type ThinkingLevel, thinkingLevelSchema} from '@omnicraft/api-schema';
import type {SseErrorEvent, SseEvent} from '@omnicraft/sse-events';
import {z} from 'zod';

// keep the rest of the imports unchanged, but remove:
// import {subagentRecordSchema} from './state/subagent-registry.js';

export const agentSnapshotSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  sseEventCount: z.number(),
  llmSession: llmSessionSnapshotSchema,
  options: agentSnapshotOptionsSchema,
});
```

In `apps/backend/src/agent-core/agent/agent.ts`, replace snapshot registry construction with a fresh registry and remove `subagents` from `toSnapshot()`:

```typescript
if (snapshot) {
  assert(
    Object.hasOwn(snapshot.options, 'thinkingLevel'),
    'Snapshot is missing thinkingLevel',
  );
  this.thinkingLevel = snapshot.options.thinkingLevel;
  this.id = snapshot.id;
  this.title = snapshot.title;
  this.sseEventCount = snapshot.sseEventCount;
  this.workingDirectory =
    snapshot.options.workingDirectory ??
    agentWorkingDirectoryService.createDefaultWorkingDirectory(this.id);
  this.llmSession = new LlmSession(getConfig, snapshot.llmSession);
  this.subagentRegistry = new SubagentRegistry();
} else {
  this.thinkingLevel = options.thinkingLevel;
  this.id = crypto.randomUUID();
  this.workingDirectory =
    options.workingDirectory ??
    agentWorkingDirectoryService.createDefaultWorkingDirectory(this.id);
  this.llmSession = new LlmSession(getConfig);
  this.subagentRegistry = new SubagentRegistry();
}
```

```typescript
toSnapshot(): AgentSnapshot {
  return {
    id: this.id,
    title: this.title,
    sseEventCount: this.sseEventCount,
    llmSession: this.llmSession.toSnapshot(),
    options: {
      workingDirectory: this.workingDirectory,
      thinkingLevel: this.thinkingLevel,
    },
  };
}
```

- [ ] **Step 4: Run snapshot tests to verify they pass**

Run:

```bash
bun --filter @omnicraft/backend test -- src/agent-core/agent/agent.test.ts src/agent-core/agent/persistence/agent-persistence.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit snapshot removal**

Run:

```bash
git add apps/backend/src/agent-core/agent/types.ts apps/backend/src/agent-core/agent/agent.ts apps/backend/src/agent-core/agent/agent.test.ts apps/backend/src/agent-core/agent/persistence/agent-persistence.test.ts
git commit -m "refactor: remove subagents from agent snapshots"
```

Expected: commit succeeds. The pre-commit hook formats and lints staged files; no extra format/lint command is needed solely because the hook ran.

---

### Task 3: Replace `list_agents` With `list_resumable_agents`

**Files:**

- Delete: `apps/backend/src/agent/tools/sub-agent/list-agents-tool.ts`
- Delete: `apps/backend/src/agent/tools/sub-agent/list-agents-tool.test.ts`
- Create: `apps/backend/src/agent/tools/sub-agent/list-resumable-agents-tool.ts`
- Create: `apps/backend/src/agent/tools/sub-agent/list-resumable-agents-tool.test.ts`
- Modify: `apps/backend/src/agent/tools/sub-agent/sub-agent-tool-registry.ts`

- [ ] **Step 1: Delete old list tool files and create the new failing test**

Delete these files:

```bash
rm apps/backend/src/agent/tools/sub-agent/list-agents-tool.ts
rm apps/backend/src/agent/tools/sub-agent/list-agents-tool.test.ts
```

Create `apps/backend/src/agent/tools/sub-agent/list-resumable-agents-tool.test.ts` with:

```typescript
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {SubAgentType} from '@omnicraft/api-schema';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import type {Agent} from '@/agent-core/agent/index.js';
import {agentPersistence} from '@/agent-core/agent/index.js';
import {createMockContext} from '@/agent-core/tool/testing.js';
import type {ToolExecutionContext} from '@/agent-core/tool/types.js';

import {listResumableAgentsTool} from './list-resumable-agents-tool.js';
import {SubAgentToolRegistry} from './sub-agent-tool-registry.js';

function createMockAgent(
  overrides: {
    id?: string;
    title?: string;
    isRunning?: boolean;
    activeReaderCount?: number;
  } = {},
): Agent {
  const agent = {
    id: overrides.id ?? crypto.randomUUID(),
    title: overrides.title ?? 'New Session',
    sseLog: {
      activeReaderCount: overrides.activeReaderCount ?? 0,
    },
  } as Agent;

  Object.defineProperty(agent, 'isRunning', {
    get: () => overrides.isRunning ?? false,
  });

  return agent;
}

describe('listResumableAgentsTool', () => {
  let tmpDir: string;
  let context: ToolExecutionContext;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'list-resumable-agents-test-'),
    );
    context = createMockContext({
      sessionsDir: tmpDir,
      workingDirectory: '/workspace/project',
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  it('has the correct live-only name', () => {
    expect(listResumableAgentsTool.name).toBe('list_resumable_agents');
  });

  it('is registered by the subagent tool registry', () => {
    SubAgentToolRegistry.resetInstance();
    try {
      const registry = SubAgentToolRegistry.create();

      expect(registry.get('list_resumable_agents')).toBe(
        listResumableAgentsTool,
      );
      expect(registry.get('list_agents')).toBeUndefined();
    } finally {
      SubAgentToolRegistry.resetInstance();
    }
  });

  it('returns an empty list when no live subagents are registered', async () => {
    const result = await listResumableAgentsTool.execute({}, context);

    expect(result).toMatchObject({
      status: 'success',
      data: {agents: []},
    });
    expect(result.content).toContain('No subagents are available to resume');
  });

  it('lists live subagents from the registry', async () => {
    const general = createMockAgent({title: 'Build Summary'});
    const explore = createMockAgent({
      title: 'Explore Report',
      isRunning: true,
    });
    context.subagentRegistry.register(general, SubAgentType.GENERAL);
    context.subagentRegistry.register(explore, SubAgentType.EXPLORE);

    const result = await listResumableAgentsTool.execute({}, context);

    expect(result).toMatchObject({
      status: 'success',
      data: {
        agents: [
          {
            id: general.id,
            agentType: SubAgentType.GENERAL,
            title: 'Build Summary',
            isRunning: false,
          },
          {
            id: explore.id,
            agentType: SubAgentType.EXPLORE,
            title: 'Explore Report',
            isRunning: true,
          },
        ],
      },
    });
    expect(result.content).toContain(general.id);
    expect(result.content).toContain('Build Summary');
    expect(result.content).toContain('idle');
    expect(result.content).toContain(explore.id);
    expect(result.content).toContain('Explore Report');
    expect(result.content).toContain('running');
  });

  it('does not read persisted metadata or snapshots', async () => {
    const metadataSpy = vi.spyOn(agentPersistence, 'metadataPath');
    const snapshotSpy = vi.spyOn(agentPersistence, 'loadSnapshot');
    const agent = createMockAgent({title: 'Live Title'});
    context.subagentRegistry.register(agent, SubAgentType.GENERAL);

    const result = await listResumableAgentsTool.execute({}, context);

    expect(result).toMatchObject({
      status: 'success',
      data: {
        agents: [
          {
            id: agent.id,
            agentType: SubAgentType.GENERAL,
            title: 'Live Title',
            isRunning: false,
          },
        ],
      },
    });
    expect(metadataSpy).not.toHaveBeenCalled();
    expect(snapshotSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run list-live tests to verify they fail**

Run:

```bash
bun --filter @omnicraft/backend test -- src/agent/tools/sub-agent/list-resumable-agents-tool.test.ts
```

Expected: FAIL because `list-resumable-agents-tool.ts` does not exist and the registry still imports `listAgentsTool`.

- [ ] **Step 3: Create the new list-live tool**

Create `apps/backend/src/agent/tools/sub-agent/list-resumable-agents-tool.ts` with:

```typescript
import type {SubAgentType} from '@omnicraft/api-schema';
import {z} from 'zod';

import type {
  ToolDefinition,
  ToolExecuteResult,
  ToolExecutionContext,
} from '@/agent-core/tool/index.js';

interface ListedResumableAgent {
  id: string;
  agentType: SubAgentType;
  title: string;
  isRunning: boolean;
}

interface ListResumableAgentsResult {
  agents: ListedResumableAgent[];
}

const parameters = z.object({});

function formatListResumableAgentsContent(
  agents: readonly ListedResumableAgent[],
): string {
  if (agents.length === 0) {
    return 'No subagents are available to resume.';
  }

  return agents
    .map((agent) => {
      const status = agent.isRunning ? 'running' : 'idle';
      return `- ${agent.title} (${agent.agentType}, ${status})\n  id: ${agent.id}`;
    })
    .join('\n');
}

export const listResumableAgentsTool: ToolDefinition<
  typeof parameters,
  ListResumableAgentsResult
> = {
  name: 'list_resumable_agents',
  displayName: 'List Resumable Agents',
  description:
    'Lists subagents that can be resumed. ' +
    'Use this as a fallback to look up a previously dispatched subagent before calling resume_agent.',
  parameters,
  suppressToolEvents: true,
  compactResult({content}) {
    return content.trim() || null;
  },
  execute(
    _args: z.infer<typeof parameters>,
    context: ToolExecutionContext,
  ): ToolExecuteResult<ListResumableAgentsResult> {
    const agents = context.subagentRegistry.list();

    return {
      data: {agents},
      content: formatListResumableAgentsContent(agents),
      status: 'success',
    };
  },
};
```

- [ ] **Step 4: Register the new tool**

Update `apps/backend/src/agent/tools/sub-agent/sub-agent-tool-registry.ts` to import and register `listResumableAgentsTool`:

```typescript
import {ToolRegistry} from '@/agent-core/tool/index.js';

import {dispatchAgentTool} from './dispatch-agent-tool.js';
import {listResumableAgentsTool} from './list-resumable-agents-tool.js';

/** Registry for subagent-related tools. */
export class SubAgentToolRegistry extends ToolRegistry {
  /** Creates the singleton and registers all subagent tools. */
  static override create(): SubAgentToolRegistry {
    const instance = super.create() as SubAgentToolRegistry;
    instance.register(listResumableAgentsTool);
    instance.register(dispatchAgentTool);
    return instance;
  }
}
```

- [ ] **Step 5: Run list-live tests to verify they pass**

Run:

```bash
bun --filter @omnicraft/backend test -- src/agent/tools/sub-agent/list-resumable-agents-tool.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit list tool replacement**

Run:

```bash
git add apps/backend/src/agent/tools/sub-agent/list-resumable-agents-tool.ts apps/backend/src/agent/tools/sub-agent/list-resumable-agents-tool.test.ts apps/backend/src/agent/tools/sub-agent/sub-agent-tool-registry.ts
git add -u apps/backend/src/agent/tools/sub-agent/list-agents-tool.ts apps/backend/src/agent/tools/sub-agent/list-agents-tool.test.ts
git commit -m "feat: add live subagent listing tool"
```

Expected: commit succeeds. The pre-commit hook formats and lints staged files; no extra format/lint command is needed solely because the hook ran.

---

### Task 4: Register Live Subagent Instances From Dispatch

**Files:**

- Modify: `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts`
- Modify: `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.test.ts`

- [ ] **Step 1: Update dispatch registration test**

In `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.test.ts`, replace the old registration test with:

```typescript
it('registers the dispatched live subagent in the parent context registry', () => {
  const subagent = {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Live Subagent',
    sseLog: {activeReaderCount: 0},
  } as Agent;

  Object.defineProperty(subagent, 'isRunning', {
    get: () => false,
  });

  registerSubAgent(context, subagent, SubAgentType.EXPLORE);

  expect(context.subagentRegistry.get(subagent.id)).toEqual({
    agent: subagent,
    agentType: SubAgentType.EXPLORE,
  });
  expect(context.subagentRegistry.list()).toEqual([
    {
      id: subagent.id,
      agentType: SubAgentType.EXPLORE,
      title: 'Live Subagent',
      isRunning: false,
    },
  ]);
});
```

- [ ] **Step 2: Run dispatch tests to verify they fail**

Run:

```bash
bun --filter @omnicraft/backend test -- src/agent/tools/sub-agent/dispatch-agent-tool.test.ts
```

Expected: FAIL because `registerSubAgent()` still passes a persisted record shape.

- [ ] **Step 3: Update dispatch registration implementation**

In `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts`, replace `registerSubAgent()` with:

```typescript
export function registerSubAgent(
  context: ToolExecutionContext,
  subagent: Agent,
  agentType: SubAgentType,
): void {
  context.subagentRegistry.register(subagent, agentType);
}
```

Keep the call site unchanged:

```typescript
registerSubAgent(context, subagent, agentType);
```

- [ ] **Step 4: Run dispatch tests to verify they pass**

Run:

```bash
bun --filter @omnicraft/backend test -- src/agent/tools/sub-agent/dispatch-agent-tool.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit dispatch integration**

Run:

```bash
git add apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.test.ts
git commit -m "refactor: register live subagents from dispatch"
```

Expected: commit succeeds. The pre-commit hook formats and lints staged files; no extra format/lint command is needed solely because the hook ran.

---

### Task 5: Full Cleanup And Verification

**Files:**

- Inspect all files matching old persisted-listing terms.
- Modify any remaining compile failures from the earlier tasks.

- [ ] **Step 1: Search for old durable-listing symbols**

Run:

```bash
rg "list_agents|listAgentsTool|list-agents-tool|\bSubagentRecord\b|subagentRecordSchema|snapshot\.subagents|toSnapshot\(\)\.subagents|subagents:" apps/backend/src -n
```

Expected: no production references to old symbols. Remaining matches in comments or deleted-file paths should be removed before continuing.

- [ ] **Step 2: Run focused backend tests**

Run:

```bash
bun --filter @omnicraft/backend test -- src/agent-core/agent/state/subagent-registry.test.ts src/agent-core/agent/agent.test.ts src/agent-core/agent/persistence/agent-persistence.test.ts src/agent/tools/sub-agent/list-resumable-agents-tool.test.ts src/agent/tools/sub-agent/dispatch-agent-tool.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run backend typecheck**

Run:

```bash
bun --filter @omnicraft/backend typecheck
```

Expected: PASS.

- [ ] **Step 4: Run backend lint**

Run:

```bash
bun --filter @omnicraft/backend lint
```

Expected: PASS.

- [ ] **Step 5: Commit final cleanup if needed**

If Steps 1-4 required code changes after the previous commits, run:

```bash
git add apps/backend/src
git commit -m "chore: clean up live subagent registry migration"
```

Expected: commit succeeds only when there are additional cleanup changes. If `git status --short` is empty after Step 4, skip this commit.

---

## Self-Review

Spec coverage:

- Live `SubagentRegistry` with `Agent` instances: Task 1.
- No registry persistence in `AgentSnapshot`: Task 2.
- Bounded per-parent LRU with max 10: Task 1.
- List only resume-capable subagents: Task 3.
- Running state visible to future continuation: Task 1 and Task 3.
- Existing subagent persistence remains dispatch side effect only: Task 4 leaves subagent `sessionsDir` behavior unchanged.
- Tool rename from `list_agents` to `list_resumable_agents`: Task 3.
- No disk restore path: Task 3 removes metadata/snapshot reads; Task 5 searches old durable-listing symbols.

Placeholder scan: this plan contains concrete file paths, replacement snippets, commands, and expected results. It contains no unresolved implementation markers.

Type consistency: `SubagentRegistry.register(agent, agentType)`, `get(id)`, and `list()` signatures are used consistently across registry, dispatch, and list-live tool tasks.
