# Subagent Resume Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `resume_subagent` so the main agent can continue a persisted subagent from copied history without asking the LLM to supply the subagent type.

**Architecture:** Keep generic `Agent` persistence unchanged and store subagent-specific control data in `subagent.json`, written by the dispatch path. Resume prepares a new persisted subagent directory by copying LLM messages and SSE events, deriving new metadata from the source sidecar, then runs the same shared subagent forwarding lifecycle as fresh dispatch.

**Tech Stack:** TypeScript, Bun, Vitest, Zod, Node.js `fs/promises`, existing OmniCraft `Agent` persistence and SSE schemas.

---

## File Structure

- `apps/backend/src/agent/tools/sub-agent/subagent-types.ts` owns shared subagent type constants, schema, and result type so dispatch, resume, metadata, and runner do not import through each other.
- `apps/backend/src/agent/tools/sub-agent/subagent-history.ts` owns subagent persistence helpers: `subagent.json`, copied SSE events, resumed snapshot creation, and persisted resume state preparation.
- `apps/backend/src/agent/tools/sub-agent/subagent-runner.ts` owns the shared subscribe/forward/summary/complete lifecycle for both fresh and resumed subagent turns.
- `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts` keeps the `dispatch_agent` tool surface, creates fresh subagents, persists `subagent.json`, and calls the shared runner.
- `apps/backend/src/agent/tools/sub-agent/resume-subagent-tool.ts` defines `resume_subagent`, loads source sidecar metadata, constructs the resumed subagent, and calls the shared runner.
- `apps/backend/src/agent/tools/sub-agent/sub-agent-tool-registry.ts` registers both subagent tools.
- `apps/backend/src/agent/agents/general-sub-agent/general-sub-agent.ts` and `apps/backend/src/agent/agents/explore-sub-agent/explore-sub-agent.ts` accept an optional `AgentSnapshot` for restored construction.
- `apps/backend/src/agent/tools/sub-agent/*.test.ts` cover helpers, dispatch metadata, runner behavior, resume schema, and registry wiring.

---

### Task 1: Add Shared Subagent Types and Sidecar Metadata

**Files:**

- Create: `apps/backend/src/agent/tools/sub-agent/subagent-types.ts`
- Create: `apps/backend/src/agent/tools/sub-agent/subagent-history.ts`
- Create: `apps/backend/src/agent/tools/sub-agent/subagent-history.test.ts`
- Modify: `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts`
- Modify: `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.test.ts`

- [ ] **Step 1: Write failing metadata helper tests**

Create `apps/backend/src/agent/tools/sub-agent/subagent-history.test.ts` with these tests:

```typescript
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {SUB_AGENT_TYPE} from './subagent-types.js';
import {
  loadSubagentMetadata,
  persistSubagentMetadata,
  subagentMetadataPath,
} from './subagent-history.js';

describe('subagent history metadata helpers', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'subagent-history-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  it('computes the subagent sidecar metadata path', () => {
    expect(subagentMetadataPath(tmpDir, 'subagent-1')).toBe(
      path.join(tmpDir, 'subagent-1', 'subagent.json'),
    );
  });

  it('persists and loads subagent sidecar metadata', async () => {
    await persistSubagentMetadata(tmpDir, 'subagent-1', {
      schemaVersion: 1,
      id: 'subagent-1',
      agentType: SUB_AGENT_TYPE.EXPLORE,
      createdAt: 123,
    });

    await expect(
      fs.readFile(path.join(tmpDir, 'subagent-1', 'subagent.json'), 'utf-8'),
    ).resolves.toContain('"agentType": "explore"');

    await expect(loadSubagentMetadata(tmpDir, 'subagent-1')).resolves.toEqual({
      schemaVersion: 1,
      id: 'subagent-1',
      agentType: SUB_AGENT_TYPE.EXPLORE,
      createdAt: 123,
    });
  });

  it('rejects sidecar metadata whose id does not match the requested subagent', async () => {
    await persistSubagentMetadata(tmpDir, 'subagent-1', {
      schemaVersion: 1,
      id: 'subagent-1',
      agentType: SUB_AGENT_TYPE.GENERAL,
      createdAt: 123,
    });

    await expect(loadSubagentMetadata(tmpDir, 'subagent-2')).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the failing metadata tests**

Run:

```bash
bun run --filter '@omnicraft/backend' test -- src/agent/tools/sub-agent/subagent-history.test.ts
```

Expected: FAIL because `subagent-types.ts` and `subagent-history.ts` do not exist yet.

- [ ] **Step 3: Create shared subagent types**

Create `apps/backend/src/agent/tools/sub-agent/subagent-types.ts`:

```typescript
import {z} from 'zod';

export const SUB_AGENT_TYPE = {
  GENERAL: 'general',
  EXPLORE: 'explore',
} as const;

export type SubAgentType = (typeof SUB_AGENT_TYPE)[keyof typeof SUB_AGENT_TYPE];

export const agentTypeSchema = z.enum([
  SUB_AGENT_TYPE.GENERAL,
  SUB_AGENT_TYPE.EXPLORE,
]);

export interface DispatchAgentResult {
  subagentId: string;
  agentType: SubAgentType;
  summary: string;
}
```

- [ ] **Step 4: Create subagent metadata helpers**

Create `apps/backend/src/agent/tools/sub-agent/subagent-history.ts`:

```typescript
import crypto from 'node:crypto';
import {mkdir, readFile, rename, writeFile} from 'node:fs/promises';
import path from 'node:path';

import {z} from 'zod';

import {agentTypeSchema} from './subagent-types.js';

export const subagentMetadataSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string(),
  agentType: agentTypeSchema,
  createdAt: z.number(),
  resumedFromSubagentId: z.string().optional(),
});

export type SubagentMetadata = z.infer<typeof subagentMetadataSchema>;

export function subagentMetadataPath(
  subagentSessionsDir: string,
  subagentId: string,
): string {
  return path.join(subagentSessionsDir, subagentId, 'subagent.json');
}

export async function loadSubagentMetadata(
  subagentSessionsDir: string,
  subagentId: string,
): Promise<SubagentMetadata> {
  const content = await readFile(
    subagentMetadataPath(subagentSessionsDir, subagentId),
    'utf-8',
  );
  const metadata = subagentMetadataSchema.parse(JSON.parse(content));
  if (metadata.id !== subagentId) {
    throw new Error(
      `Subagent metadata id mismatch: expected ${subagentId}, got ${metadata.id}`,
    );
  }
  return metadata;
}

export async function persistSubagentMetadata(
  subagentSessionsDir: string,
  subagentId: string,
  metadata: SubagentMetadata,
): Promise<void> {
  if (metadata.id !== subagentId) {
    throw new Error(
      `Subagent metadata id mismatch: expected ${subagentId}, got ${metadata.id}`,
    );
  }

  const filePath = subagentMetadataPath(subagentSessionsDir, subagentId);
  const tmpPath = `${filePath}.${crypto.randomUUID()}.tmp`;
  await mkdir(path.dirname(filePath), {recursive: true});
  await writeFile(tmpPath, JSON.stringify(metadata, null, 2) + '\n');
  await rename(tmpPath, filePath);
}
```

- [ ] **Step 5: Move type exports out of `dispatch-agent-tool.ts`**

In `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts`, remove the local `SUB_AGENT_TYPE`, `SubAgentType`, `agentTypeSchema`, and `DispatchAgentResult` definitions. Add this import near the other local imports:

```typescript
import {
  agentTypeSchema,
  type DispatchAgentResult,
  SUB_AGENT_TYPE,
  type SubAgentType,
} from './subagent-types.js';
```

Leave all existing behavior unchanged in this task.

- [ ] **Step 6: Update tests to import shared types**

In `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.test.ts`, change the imports so `SUB_AGENT_TYPE` comes from `subagent-types.js`:

```typescript
import {
  createSubAgent,
  dispatchAgentTool,
  getSubagentSessionsDir,
} from './dispatch-agent-tool.js';
import {SUB_AGENT_TYPE} from './subagent-types.js';
```

- [ ] **Step 7: Run targeted tests**

Run:

```bash
bun run --filter '@omnicraft/backend' test -- \
  src/agent/tools/sub-agent/subagent-history.test.ts \
  src/agent/tools/sub-agent/dispatch-agent-tool.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/agent/tools/sub-agent/subagent-types.ts \
  apps/backend/src/agent/tools/sub-agent/subagent-history.ts \
  apps/backend/src/agent/tools/sub-agent/subagent-history.test.ts \
  apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts \
  apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.test.ts
git commit -m "feat(subagent): add sidecar metadata helpers"
```

---

### Task 2: Allow Restored Subagent Construction

**Files:**

- Modify: `apps/backend/src/agent/agents/general-sub-agent/general-sub-agent.ts`
- Modify: `apps/backend/src/agent/agents/explore-sub-agent/explore-sub-agent.ts`
- Modify: `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts`
- Modify: `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.test.ts`

- [ ] **Step 1: Add failing tests for snapshot-based construction**

In `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.test.ts`, add this import:

```typescript
import type {AgentSnapshot} from '@/agent-core/agent/index.js';
```

Add these tests after the existing `creates an explore subagent for explore tasks` test:

```typescript
it('creates a general subagent from a provided snapshot', () => {
  resetAgentRegistries();
  initAgentRegistries();
  try {
    const snapshot: AgentSnapshot = {
      id: 'restored-general-id',
      title: 'Restored General',
      sseEventCount: 0,
      llmSession: {id: 'restored-llm-id', messages: []},
      options: {workingDirectory: tmpDir, thinkingLevel: 'none'},
    };

    const subagent = createSubAgent(
      SUB_AGENT_TYPE.GENERAL,
      context.getConfig,
      tmpDir,
      'none',
      undefined,
      snapshot,
    );

    expect(subagent).toBeInstanceOf(GeneralSubAgent);
    expect(subagent.id).toBe('restored-general-id');
  } finally {
    resetAgentRegistries();
  }
});

it('creates an explore subagent from a provided snapshot', () => {
  resetAgentRegistries();
  initAgentRegistries();
  try {
    const snapshot: AgentSnapshot = {
      id: 'restored-explore-id',
      title: 'Restored Explore',
      sseEventCount: 0,
      llmSession: {id: 'restored-llm-id', messages: []},
      options: {workingDirectory: tmpDir, thinkingLevel: 'none'},
    };

    const subagent = createSubAgent(
      SUB_AGENT_TYPE.EXPLORE,
      context.getConfig,
      tmpDir,
      'none',
      undefined,
      snapshot,
    );

    expect(subagent).toBeInstanceOf(ExploreSubAgent);
    expect(subagent.id).toBe('restored-explore-id');
  } finally {
    resetAgentRegistries();
  }
});
```

- [ ] **Step 2: Run the failing construction tests**

Run:

```bash
bun run --filter '@omnicraft/backend' test -- src/agent/tools/sub-agent/dispatch-agent-tool.test.ts
```

Expected: FAIL because `createSubAgent()` and the subagent constructors do not accept `snapshot` yet.

- [ ] **Step 3: Update `GeneralSubAgent` constructor**

In `apps/backend/src/agent/agents/general-sub-agent/general-sub-agent.ts`, import `AgentSnapshot` and pass the optional snapshot to `super()`:

```typescript
import {Agent} from '@/agent-core/agent/index.js';
import type {AgentSnapshot} from '@/agent-core/agent/index.js';
```

Update the constructor tail:

```typescript
  constructor(
    getConfig: () => Promise<LlmConfig>,
    workingDirectory: string,
    thinkingLevel: ThinkingLevel,
    sessionsDir?: string,
    snapshot?: AgentSnapshot,
  ) {
    super(
      getConfig,
      {
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
        thinkingLevel,
        workingDirectory,
        sessionsDir,
      },
      snapshot,
    );
  }
```

- [ ] **Step 4: Update `ExploreSubAgent` constructor**

In `apps/backend/src/agent/agents/explore-sub-agent/explore-sub-agent.ts`, import `AgentSnapshot` and pass the optional snapshot to `super()`:

```typescript
import {Agent} from '@/agent-core/agent/index.js';
import type {AgentSnapshot} from '@/agent-core/agent/index.js';
```

Update the constructor tail:

```typescript
  constructor(
    getConfig: () => Promise<LlmConfig>,
    workingDirectory: string,
    thinkingLevel: ThinkingLevel,
    sessionsDir?: string,
    snapshot?: AgentSnapshot,
  ) {
    super(
      getConfig,
      {
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
        thinkingLevel,
        workingDirectory,
        sessionsDir,
      },
      snapshot,
    );
  }
```

- [ ] **Step 5: Pass snapshot through `createSubAgent()`**

In `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts`, import `AgentSnapshot`:

```typescript
import type {Agent, AgentSnapshot} from '@/agent-core/agent/index.js';
```

Update the factory signature and constructor calls:

```typescript
export function createSubAgent(
  agentType: SubAgentType,
  getConfig: () => Promise<LlmConfig>,
  workingDirectory: string,
  thinkingLevel: z.infer<typeof thinkingLevelSchema>,
  sessionsDir?: string,
  snapshot?: AgentSnapshot,
): Agent {
  switch (agentType) {
    case SUB_AGENT_TYPE.GENERAL:
      return new GeneralSubAgent(
        getConfig,
        workingDirectory,
        thinkingLevel,
        sessionsDir,
        snapshot,
      );
    case SUB_AGENT_TYPE.EXPLORE:
      return new ExploreSubAgent(
        getConfig,
        workingDirectory,
        thinkingLevel,
        sessionsDir,
        snapshot,
      );
  }
}
```

- [ ] **Step 6: Run targeted construction tests**

Run:

```bash
bun run --filter '@omnicraft/backend' test -- src/agent/tools/sub-agent/dispatch-agent-tool.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/agent/agents/general-sub-agent/general-sub-agent.ts \
  apps/backend/src/agent/agents/explore-sub-agent/explore-sub-agent.ts \
  apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts \
  apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.test.ts
git commit -m "feat(subagent): construct subagents from snapshots"
```

---

### Task 3: Add History Copy and Resume Preparation Helpers

**Files:**

- Modify: `apps/backend/src/agent/tools/sub-agent/subagent-history.ts`
- Modify: `apps/backend/src/agent/tools/sub-agent/subagent-history.test.ts`

- [ ] **Step 1: Add failing tests for resumed snapshots and copied SSE events**

In `apps/backend/src/agent/tools/sub-agent/subagent-history.test.ts`, add these imports:

```typescript
import {
  agentPersistence,
  type AgentSnapshot,
} from '@/agent-core/agent/index.js';
import type {SseEvent} from '@omnicraft/sse-events';

import {
  copySubagentSseEvents,
  createResumedSubagentSnapshot,
  prepareResumedSubagentState,
} from './subagent-history.js';
```

Add this helper below the imports:

```typescript
function createSnapshot(id: string, sseEventCount: number): AgentSnapshot {
  return {
    id,
    title: 'Source Subagent',
    sseEventCount,
    llmSession: {
      id: `${id}-llm`,
      messages: [
        {
          id: `${id}-message`,
          createdAt: 1,
          role: 'user',
          content: 'original task',
        },
      ],
    },
    options: {workingDirectory: tmpDir, thinkingLevel: 'none'},
  };
}

async function writeEvents(
  sessionsDir: string,
  id: string,
  events: SseEvent[],
): Promise<void> {
  const filePath = agentPersistence.eventsPath(sessionsDir, id);
  await fs.mkdir(path.dirname(filePath), {recursive: true});
  await fs.writeFile(
    filePath,
    events.map((event) => JSON.stringify(event) + '\n').join(''),
  );
}
```

Add these tests inside the existing `describe('subagent history metadata helpers', ...)` block:

```typescript
it('creates a resumed snapshot with new agent and llm session ids', () => {
  const source = createSnapshot('source-id', 0);

  const resumed = createResumedSubagentSnapshot(
    source,
    'target-id',
    'target-llm-id',
  );

  expect(resumed).toMatchObject({
    ...source,
    id: 'target-id',
    llmSession: {
      ...source.llmSession,
      id: 'target-llm-id',
      messages: source.llmSession.messages,
    },
  });
  expect(resumed.sseEventCount).toBe(source.sseEventCount);
});

it('copies exactly the source snapshot sse event count', async () => {
  const source = createSnapshot('source-id', 2);
  await writeEvents(tmpDir, source.id, [
    {
      type: 'message-start',
      role: 'assistant',
      messageId: 'm1',
      createdAt: 1,
      content: '',
    },
    {type: 'text-delta', content: 'hello'},
    {type: 'text-delta', content: 'ignored-extra'},
  ]);

  await copySubagentSseEvents({
    sourceSessionsDir: tmpDir,
    sourceSnapshot: source,
    targetSessionsDir: tmpDir,
    targetId: 'target-id',
  });

  const copied = await fs.readFile(
    agentPersistence.eventsPath(tmpDir, 'target-id'),
    'utf-8',
  );
  expect(copied.trimEnd().split('\n')).toHaveLength(2);
  expect(copied).toContain('"message-start"');
  expect(copied).toContain('hello');
  expect(copied).not.toContain('ignored-extra');
});

it('fails when source event log has fewer valid events than the snapshot count', async () => {
  const source = createSnapshot('source-id', 2);
  await writeEvents(tmpDir, source.id, [
    {type: 'text-delta', content: 'only one'},
  ]);

  await expect(
    copySubagentSseEvents({
      sourceSessionsDir: tmpDir,
      sourceSnapshot: source,
      targetSessionsDir: tmpDir,
      targetId: 'target-id',
    }),
  ).rejects.toThrow('expected 2 SSE events');
});

it('prepares a resumed persisted subagent state', async () => {
  const source = createSnapshot('source-id', 1);
  await agentPersistence.persistSnapshot(tmpDir, source.id, source);
  await persistSubagentMetadata(tmpDir, source.id, {
    schemaVersion: 1,
    id: source.id,
    agentType: SUB_AGENT_TYPE.EXPLORE,
    createdAt: 10,
  });
  await writeEvents(tmpDir, source.id, [{type: 'text-delta', content: 'old'}]);

  const prepared = await prepareResumedSubagentState({
    subagentSessionsDir: tmpDir,
    sourceSubagentId: source.id,
  });

  expect(prepared.snapshot.id).not.toBe(source.id);
  expect(prepared.snapshot.llmSession.id).not.toBe(source.llmSession.id);
  expect(prepared.snapshot.llmSession.messages).toEqual(
    source.llmSession.messages,
  );
  expect(prepared.metadata).toMatchObject({
    schemaVersion: 1,
    id: prepared.snapshot.id,
    agentType: SUB_AGENT_TYPE.EXPLORE,
    resumedFromSubagentId: source.id,
  });
  expect(prepared.subagentSseEventStartIndex).toBe(1);
  await expect(
    loadSubagentMetadata(tmpDir, prepared.snapshot.id),
  ).resolves.toEqual(prepared.metadata);
});
```

- [ ] **Step 2: Run the failing history tests**

Run:

```bash
bun run --filter '@omnicraft/backend' test -- src/agent/tools/sub-agent/subagent-history.test.ts
```

Expected: FAIL because the resume helpers are not implemented yet.

- [ ] **Step 3: Implement resumed snapshot creation**

In `apps/backend/src/agent/tools/sub-agent/subagent-history.ts`, add imports:

```typescript
import {sseEventSchema} from '@omnicraft/sse-events';

import {
  agentPersistence,
  type AgentSnapshot,
} from '@/agent-core/agent/index.js';
import {isFileNotFoundError} from '@/helpers/fs.js';
```

Add this function:

```typescript
export function createResumedSubagentSnapshot(
  source: AgentSnapshot,
  newAgentId: string,
  newLlmSessionId: string,
): AgentSnapshot {
  return {
    ...source,
    id: newAgentId,
    llmSession: {
      ...source.llmSession,
      id: newLlmSessionId,
      messages: source.llmSession.messages,
    },
  };
}
```

- [ ] **Step 4: Implement SSE event copying**

Add this function to `subagent-history.ts`:

```typescript
export async function copySubagentSseEvents(params: {
  sourceSessionsDir: string;
  sourceSnapshot: AgentSnapshot;
  targetSessionsDir: string;
  targetId: string;
}): Promise<void> {
  const expectedCount = params.sourceSnapshot.sseEventCount;
  if (expectedCount === 0) return;

  const sourcePath = agentPersistence.eventsPath(
    params.sourceSessionsDir,
    params.sourceSnapshot.id,
  );
  const targetPath = agentPersistence.eventsPath(
    params.targetSessionsDir,
    params.targetId,
  );

  let content: string;
  try {
    content = await readFile(sourcePath, 'utf-8');
  } catch (error: unknown) {
    if (isFileNotFoundError(error)) {
      throw new Error(
        `Cannot resume subagent ${params.sourceSnapshot.id}: expected ${expectedCount.toString()} SSE events but source event log is missing`,
      );
    }
    throw error;
  }

  const validLines: string[] = [];
  for (const line of content.split('\n')) {
    if (line === '') continue;
    if (validLines.length >= expectedCount) break;
    try {
      sseEventSchema.parse(JSON.parse(line));
      validLines.push(line);
    } catch {
      break;
    }
  }

  if (validLines.length !== expectedCount) {
    throw new Error(
      `Cannot resume subagent ${params.sourceSnapshot.id}: expected ${expectedCount.toString()} SSE events but copied ${validLines.length.toString()}`,
    );
  }

  await mkdir(path.dirname(targetPath), {recursive: true});
  await writeFile(targetPath, validLines.map((line) => line + '\n').join(''));
}
```

- [ ] **Step 5: Implement resume preparation**

Add this type and function to `subagent-history.ts`:

```typescript
export type PreparedResumedSubagentState = {
  snapshot: AgentSnapshot;
  metadata: SubagentMetadata;
  subagentSseEventStartIndex: number;
};

export async function prepareResumedSubagentState(params: {
  subagentSessionsDir: string;
  sourceSubagentId: string;
}): Promise<PreparedResumedSubagentState> {
  const sourceSnapshot = await agentPersistence.loadSnapshot(
    params.subagentSessionsDir,
    params.sourceSubagentId,
  );
  const sourceMetadata = await loadSubagentMetadata(
    params.subagentSessionsDir,
    params.sourceSubagentId,
  );
  const newSubagentId = crypto.randomUUID();
  const newLlmSessionId = crypto.randomUUID();

  await copySubagentSseEvents({
    sourceSessionsDir: params.subagentSessionsDir,
    sourceSnapshot,
    targetSessionsDir: params.subagentSessionsDir,
    targetId: newSubagentId,
  });

  const snapshot = createResumedSubagentSnapshot(
    sourceSnapshot,
    newSubagentId,
    newLlmSessionId,
  );
  const metadata: SubagentMetadata = {
    schemaVersion: 1,
    id: newSubagentId,
    agentType: sourceMetadata.agentType,
    createdAt: Date.now(),
    resumedFromSubagentId: params.sourceSubagentId,
  };

  agentPersistence.persistSnapshot(
    params.subagentSessionsDir,
    newSubagentId,
    snapshot,
    {sync: true},
  );
  await persistSubagentMetadata(
    params.subagentSessionsDir,
    newSubagentId,
    metadata,
  );

  return {
    snapshot,
    metadata,
    subagentSseEventStartIndex: sourceSnapshot.sseEventCount,
  };
}
```

- [ ] **Step 6: Run history tests**

Run:

```bash
bun run --filter '@omnicraft/backend' test -- src/agent/tools/sub-agent/subagent-history.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/agent/tools/sub-agent/subagent-history.ts \
  apps/backend/src/agent/tools/sub-agent/subagent-history.test.ts
git commit -m "feat(subagent): prepare persisted resume state"
```

---

### Task 4: Extract Shared Subagent Runner

**Files:**

- Create: `apps/backend/src/agent/tools/sub-agent/subagent-runner.ts`
- Create: `apps/backend/src/agent/tools/sub-agent/subagent-runner.test.ts`

- [ ] **Step 1: Add failing runner tests**

Create `apps/backend/src/agent/tools/sub-agent/subagent-runner.test.ts`:

```typescript
import {describe, expect, it} from 'vitest';

import type {SseEvent, SseEventCursorEntry} from '@omnicraft/sse-events';
import {createMockContext} from '@/agent-core/tool/testing.js';

import {runSubagentTurn, type RunnableSubagent} from './subagent-runner.js';
import {SUB_AGENT_TYPE} from './subagent-types.js';

function fakeSubagent(events: SseEvent[]): RunnableSubagent {
  return {
    id: 'subagent-1',
    abort: () => {},
    handleUserMessage: () => {},
    subscribe: ({startIndex = 0}: {startIndex?: number} = {}) => ({
      async *[Symbol.asyncIterator](): AsyncIterator<SseEventCursorEntry> {
        for (let index = startIndex; index < events.length; index++) {
          yield {event: events[index], nextIndex: index + 1};
        }
      },
    }),
  };
}

describe('runSubagentTurn', () => {
  it('forwards only events after the provided subagent SSE start index', async () => {
    const forwarded: unknown[] = [];
    const context = createMockContext({
      onSubAgentEvent: (event) => forwarded.push(event),
    });

    const result = await runSubagentTurn({
      subagent: fakeSubagent([
        {type: 'text-delta', content: 'old'},
        {
          type: 'message-start',
          role: 'assistant',
          messageId: 'm1',
          createdAt: 1,
          content: '',
        },
        {type: 'text-delta', content: 'new'},
        {
          type: 'done',
          reason: 'complete',
          usage: {
            model: 'm',
            maxInputTokens: 1,
            inputTokens: 1,
            outputTokens: 1,
            cacheReadInputTokens: 0,
            thinkingLevel: 'none',
          },
        },
      ]),
      task: 'continue',
      agentType: SUB_AGENT_TYPE.GENERAL,
      thinkingLevel: 'none',
      workingDirectory: '/tmp/work',
      context,
      subagentSseEventStartIndex: 1,
    });

    expect(result).toMatchObject({
      status: 'success',
      data: {
        subagentId: 'subagent-1',
        agentType: SUB_AGENT_TYPE.GENERAL,
        summary: 'new',
      },
    });
    expect(forwarded).toEqual([
      {
        type: 'subagent-dispatch',
        agentId: 'subagent-1',
        task: 'continue',
        agentType: SUB_AGENT_TYPE.GENERAL,
        thinkingLevel: 'none',
        workingDirectory: '/tmp/work',
      },
      {
        type: 'subagent-output',
        agentId: 'subagent-1',
        event: {
          type: 'message-start',
          role: 'assistant',
          messageId: 'm1',
          createdAt: 1,
          content: '',
        },
      },
      {
        type: 'subagent-output',
        agentId: 'subagent-1',
        event: {type: 'text-delta', content: 'new'},
      },
      {
        type: 'subagent-output',
        agentId: 'subagent-1',
        event: {
          type: 'done',
          reason: 'complete',
          usage: {
            model: 'm',
            maxInputTokens: 1,
            inputTokens: 1,
            outputTokens: 1,
            cacheReadInputTokens: 0,
            thinkingLevel: 'none',
          },
        },
      },
      {type: 'subagent-complete', agentId: 'subagent-1', status: 'success'},
    ]);
  });

  it('does not forward non-base child events through subagent-output', async () => {
    const forwarded: unknown[] = [];
    const context = createMockContext({
      onSubAgentEvent: (event) => forwarded.push(event),
    });

    await runSubagentTurn({
      subagent: fakeSubagent([
        {type: 'session-title', title: 'Hidden title'},
        {
          type: 'done',
          reason: 'complete',
          usage: {
            model: 'm',
            maxInputTokens: 1,
            inputTokens: 1,
            outputTokens: 1,
            cacheReadInputTokens: 0,
            thinkingLevel: 'none',
          },
        },
      ]),
      task: 'continue',
      agentType: SUB_AGENT_TYPE.EXPLORE,
      thinkingLevel: 'none',
      workingDirectory: '/tmp/work',
      context,
    });

    expect(forwarded).not.toContainEqual({
      type: 'subagent-output',
      agentId: 'subagent-1',
      event: {type: 'session-title', title: 'Hidden title'},
    });
  });
});
```

- [ ] **Step 2: Run the failing runner tests**

Run:

```bash
bun run --filter '@omnicraft/backend' test -- src/agent/tools/sub-agent/subagent-runner.test.ts
```

Expected: FAIL because `subagent-runner.ts` does not exist yet.

- [ ] **Step 3: Implement the shared runner**

Create `apps/backend/src/agent/tools/sub-agent/subagent-runner.ts`:

```typescript
import {type ThinkingLevel} from '@omnicraft/api-schema';
import {
  sseBaseEventSchema,
  type SseEventCursorEntry,
} from '@omnicraft/sse-events';

import type {Agent} from '@/agent-core/agent/index.js';
import type {
  ToolExecuteResult,
  ToolExecutionContext,
} from '@/agent-core/tool/index.js';

import type {DispatchAgentResult, SubAgentType} from './subagent-types.js';

export type RunnableSubagent = Pick<
  Agent,
  'id' | 'abort' | 'handleUserMessage' | 'subscribe'
>;

export async function runSubagentTurn(params: {
  subagent: RunnableSubagent;
  task: string;
  agentType: SubAgentType;
  thinkingLevel: ThinkingLevel;
  workingDirectory: string;
  context: ToolExecutionContext;
  subagentSseEventStartIndex?: number;
}): Promise<ToolExecuteResult<DispatchAgentResult>> {
  const {
    subagent,
    task,
    agentType,
    thinkingLevel,
    workingDirectory,
    context,
    subagentSseEventStartIndex,
  } = params;

  const onAbort = () => {
    subagent.abort();
  };
  context.signal.addEventListener('abort', onAbort, {once: true});

  context.onSubAgentEvent({
    type: 'subagent-dispatch',
    agentId: subagent.id,
    task,
    agentType,
    thinkingLevel,
    workingDirectory,
  });

  try {
    let lastReplyText = '';
    let completed = false;
    const eventIter: AsyncIterable<SseEventCursorEntry> = subagent.subscribe({
      startIndex: subagentSseEventStartIndex,
      signal: context.signal,
    });

    subagent.handleUserMessage(task);

    for await (const entry of eventIter) {
      const {event} = entry;
      const baseEvent = sseBaseEventSchema.safeParse(event);
      if (baseEvent.success) {
        context.onSubAgentEvent({
          type: 'subagent-output',
          agentId: subagent.id,
          event: baseEvent.data,
        });
      }

      if (event.type === 'message-start' && event.role === 'assistant') {
        lastReplyText = '';
      }
      if (event.type === 'text-delta') {
        lastReplyText += event.content;
      }
      if (event.type === 'done') {
        completed = true;
        break;
      }
    }

    context.onSubAgentEvent({
      type: 'subagent-complete',
      agentId: subagent.id,
      status: completed ? 'success' : 'failure',
    });

    if (completed) {
      const summary =
        lastReplyText ||
        'Subagent completed the task but produced no text summary.';
      return {
        data: {subagentId: subagent.id, agentType, summary},
        content: formatSubagentResult(subagent.id, agentType, summary),
        status: 'success',
      };
    }

    return {
      data: {message: 'Subagent was aborted'},
      content: formatSubagentResult(
        subagent.id,
        agentType,
        'Subagent was aborted.',
      ),
      status: 'failure',
    };
  } catch (error: unknown) {
    context.onSubAgentEvent({
      type: 'subagent-complete',
      agentId: subagent.id,
      status: 'failure',
    });

    const message = error instanceof Error ? error.message : String(error);
    return {
      data: {message: `Subagent error: ${message}`},
      content: formatSubagentResult(
        subagent.id,
        agentType,
        `Subagent error: ${message}`,
      ),
      status: 'failure',
    };
  } finally {
    context.signal.removeEventListener('abort', onAbort);
  }
}

function formatSubagentResult(
  subagentId: string,
  agentType: SubAgentType,
  summary: string,
): string {
  return `Subagent completed.\nid: ${subagentId}\ntype: ${agentType}\n\n${summary}`;
}
```

- [ ] **Step 4: Run runner tests**

Run:

```bash
bun run --filter '@omnicraft/backend' test -- src/agent/tools/sub-agent/subagent-runner.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/agent/tools/sub-agent/subagent-runner.ts \
  apps/backend/src/agent/tools/sub-agent/subagent-runner.test.ts
git commit -m "feat(subagent): extract shared subagent runner"
```

---

### Task 5: Wire Fresh Dispatch to Metadata and Runner

**Files:**

- Modify: `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts`
- Modify: `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.test.ts`

- [ ] **Step 1: Add failing fresh-dispatch metadata test**

In `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.test.ts`, import helper APIs:

```typescript
import {loadSubagentMetadata} from './subagent-history.js';
import {createFreshSubagent} from './dispatch-agent-tool.js';
```

Add this test after the existing persistence tests:

```typescript
it('fresh dispatch creation persists subagent sidecar metadata before running', async () => {
  resetAgentRegistries();
  initAgentRegistries();
  try {
    const sessionsDir = path.join(tmpDir, 'subagents');
    const subagent = await createFreshSubagent({
      agentType: SUB_AGENT_TYPE.EXPLORE,
      getConfig: context.getConfig,
      workingDirectory: tmpDir,
      thinkingLevel: 'none',
      subagentSessionsDir: sessionsDir,
    });

    await expect(
      loadSubagentMetadata(sessionsDir, subagent.id),
    ).resolves.toMatchObject({
      schemaVersion: 1,
      id: subagent.id,
      agentType: SUB_AGENT_TYPE.EXPLORE,
    });
  } finally {
    resetAgentRegistries();
  }
});
```

- [ ] **Step 2: Run the failing dispatch tests**

Run:

```bash
bun run --filter '@omnicraft/backend' test -- src/agent/tools/sub-agent/dispatch-agent-tool.test.ts
```

Expected: FAIL because `createFreshSubagent()` does not exist yet.

- [ ] **Step 3: Implement `createFreshSubagent()`**

In `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts`, import sidecar and runner helpers:

```typescript
import {persistSubagentMetadata} from './subagent-history.js';
import {runSubagentTurn} from './subagent-runner.js';
```

Add this helper after `getSubagentSessionsDir()`:

```typescript
export async function createFreshSubagent(params: {
  agentType: SubAgentType;
  getConfig: () => Promise<LlmConfig>;
  workingDirectory: string;
  thinkingLevel: z.infer<typeof thinkingLevelSchema>;
  subagentSessionsDir?: string;
}): Promise<Agent> {
  const subagent = createSubAgent(
    params.agentType,
    params.getConfig,
    params.workingDirectory,
    params.thinkingLevel,
    params.subagentSessionsDir,
  );

  if (params.subagentSessionsDir) {
    await persistSubagentMetadata(params.subagentSessionsDir, subagent.id, {
      schemaVersion: 1,
      id: subagent.id,
      agentType: params.agentType,
      createdAt: Date.now(),
    });
  }

  return subagent;
}
```

- [ ] **Step 4: Replace inline dispatch execution with helper and runner**

In `dispatchAgentTool.execute()`, replace the `createSubAgent(...)`, abort listener, `context.onSubAgentEvent(...)`, subscribe loop, and try/catch/finally block with:

```typescript
const subagentSessionsDir = getSubagentSessionsDir(context);
const subagent = await createFreshSubagent({
  agentType,
  getConfig,
  workingDirectory,
  thinkingLevel,
  subagentSessionsDir,
});

return runSubagentTurn({
  subagent,
  task,
  agentType,
  thinkingLevel,
  workingDirectory,
  context,
});
```

Remove the now-unused `SseBaseEvent` import from `@omnicraft/sse-events`.

- [ ] **Step 5: Run dispatch and runner tests**

Run:

```bash
bun run --filter '@omnicraft/backend' test -- \
  src/agent/tools/sub-agent/dispatch-agent-tool.test.ts \
  src/agent/tools/sub-agent/subagent-runner.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts \
  apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.test.ts
git commit -m "feat(subagent): persist metadata during dispatch"
```

---

### Task 6: Add `resume_subagent` Tool and Registry Wiring

**Files:**

- Create: `apps/backend/src/agent/tools/sub-agent/resume-subagent-tool.ts`
- Create: `apps/backend/src/agent/tools/sub-agent/resume-subagent-tool.test.ts`
- Modify: `apps/backend/src/agent/tools/sub-agent/sub-agent-tool-registry.ts`

- [ ] **Step 1: Add failing resume tool tests**

Create `apps/backend/src/agent/tools/sub-agent/resume-subagent-tool.test.ts`:

```typescript
import {describe, expect, it} from 'vitest';

import {SubAgentToolRegistry} from './sub-agent-tool-registry.js';
import {resumeSubagentTool} from './resume-subagent-tool.js';

describe('resumeSubagentTool', () => {
  it('has the correct name', () => {
    expect(resumeSubagentTool.name).toBe('resume_subagent');
  });

  it('requires subagentId and task but not agentType', () => {
    expect(
      resumeSubagentTool.parameters.safeParse({
        subagentId: 'subagent-1',
        task: 'continue the previous investigation',
      }).success,
    ).toBe(true);

    expect(
      resumeSubagentTool.parameters.safeParse({
        subagentId: 'subagent-1',
        task: 'continue the previous investigation',
        agentType: 'explore',
      }).success,
    ).toBe(false);
  });

  it('is registered in the subagent tool registry', () => {
    SubAgentToolRegistry.resetInstance();
    const registry = SubAgentToolRegistry.create();

    expect(registry.get('resume_subagent')).toBe(resumeSubagentTool);

    SubAgentToolRegistry.resetInstance();
  });
});
```

- [ ] **Step 2: Run the failing resume tests**

Run:

```bash
bun run --filter '@omnicraft/backend' test -- src/agent/tools/sub-agent/resume-subagent-tool.test.ts
```

Expected: FAIL because `resume-subagent-tool.ts` does not exist and the registry does not include it.

- [ ] **Step 3: Implement `resume_subagent`**

Create `apps/backend/src/agent/tools/sub-agent/resume-subagent-tool.ts`:

```typescript
import {z} from 'zod';

import type {
  ToolDefinition,
  ToolExecuteResult,
  ToolExecutionContext,
} from '@/agent-core/tool/index.js';

import {createSubAgent, getSubagentSessionsDir} from './dispatch-agent-tool.js';
import {prepareResumedSubagentState} from './subagent-history.js';
import {runSubagentTurn} from './subagent-runner.js';
import type {DispatchAgentResult} from './subagent-types.js';

const parameters = z
  .object({
    subagentId: z.string().min(1).describe('The subagent ID to resume.'),
    task: z
      .string()
      .min(1)
      .describe('The follow-up task to continue the subagent.'),
    model: z
      .enum(['default', 'light'])
      .optional()
      .describe("Which model tier to use. Defaults to 'default'."),
  })
  .strict();

export const resumeSubagentTool: ToolDefinition<
  typeof parameters,
  DispatchAgentResult
> = {
  name: 'resume_subagent',
  displayName: 'Resume Subagent',
  description:
    'Resumes a previous persisted subagent by ID and sends it a follow-up task. ' +
    'Use the returned subagent ID for any later resume of the continued work.',
  parameters,
  suppressToolEvents: true,
  async execute(
    args: z.infer<typeof parameters>,
    context: ToolExecutionContext,
  ): Promise<ToolExecuteResult<DispatchAgentResult>> {
    const subagentSessionsDir = getSubagentSessionsDir(context);
    if (!subagentSessionsDir) {
      const message =
        'Cannot resume subagent because persisted history is unavailable.';
      return {data: {message}, content: `Error: ${message}`, status: 'failure'};
    }

    const getConfig =
      args.model === 'light' ? context.getLightConfig : context.getConfig;

    try {
      const {snapshot, metadata, subagentSseEventStartIndex} =
        await prepareResumedSubagentState({
          subagentSessionsDir,
          sourceSubagentId: args.subagentId,
        });
      const workingDirectory =
        snapshot.options.workingDirectory ?? context.workingDirectory;
      const thinkingLevel = snapshot.options.thinkingLevel;
      const subagent = createSubAgent(
        metadata.agentType,
        getConfig,
        workingDirectory,
        thinkingLevel,
        subagentSessionsDir,
        snapshot,
      );

      return runSubagentTurn({
        subagent,
        task: args.task,
        agentType: metadata.agentType,
        thinkingLevel,
        workingDirectory,
        context,
        subagentSseEventStartIndex,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        data: {message: `Resume subagent error: ${message}`},
        content: `Error: Resume subagent error: ${message}`,
        status: 'failure',
      };
    }
  },
};
```

- [ ] **Step 4: Register the resume tool**

In `apps/backend/src/agent/tools/sub-agent/sub-agent-tool-registry.ts`, import and register the new tool:

```typescript
import {dispatchAgentTool} from './dispatch-agent-tool.js';
import {resumeSubagentTool} from './resume-subagent-tool.js';
```

Update `create()`:

```typescript
static override create(): SubAgentToolRegistry {
  const instance = super.create() as SubAgentToolRegistry;
  instance.register(dispatchAgentTool);
  instance.register(resumeSubagentTool);
  return instance;
}
```

- [ ] **Step 5: Run resume tool tests**

Run:

```bash
bun run --filter '@omnicraft/backend' test -- src/agent/tools/sub-agent/resume-subagent-tool.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/agent/tools/sub-agent/resume-subagent-tool.ts \
  apps/backend/src/agent/tools/sub-agent/resume-subagent-tool.test.ts \
  apps/backend/src/agent/tools/sub-agent/sub-agent-tool-registry.ts
git commit -m "feat(subagent): add resume subagent tool"
```

---

### Task 7: Final Integration Coverage and Verification

**Files:**

- Modify: `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.test.ts`
- Modify: `apps/backend/src/agent/tools/sub-agent/subagent-history.test.ts`
- Modify: `apps/backend/src/agent/tools/sub-agent/subagent-runner.test.ts`
- Modify: `apps/backend/src/agent/tools/sub-agent/resume-subagent-tool.test.ts`

- [ ] **Step 1: Add final assertions for dispatch result content**

In `apps/backend/src/agent/tools/sub-agent/subagent-runner.test.ts`, add this assertion to the successful runner test after the `expect(result).toMatchObject(...)` block:

```typescript
expect(result.content).toContain('Subagent completed.');
expect(result.content).toContain('id: subagent-1');
expect(result.content).toContain('type: general');
expect(result.content).toContain('new');
```

- [ ] **Step 2: Add final missing-metadata failure coverage**

In `apps/backend/src/agent/tools/sub-agent/subagent-history.test.ts`, add:

```typescript
it('fails resume preparation when source subagent metadata is missing', async () => {
  const source = createSnapshot('source-id', 0);
  await agentPersistence.persistSnapshot(tmpDir, source.id, source);

  await expect(
    prepareResumedSubagentState({
      subagentSessionsDir: tmpDir,
      sourceSubagentId: source.id,
    }),
  ).rejects.toThrow();
});
```

- [ ] **Step 3: Run all subagent tool tests**

Run:

```bash
bun run --filter '@omnicraft/backend' test -- src/agent/tools/sub-agent
```

Expected: PASS.

- [ ] **Step 4: Run backend typecheck**

Run:

```bash
bun run --filter '@omnicraft/backend' typecheck
```

Expected: PASS.

- [ ] **Step 5: Run backend tests**

Run:

```bash
bun run --filter '@omnicraft/backend' test
```

Expected: PASS.

- [ ] **Step 6: Commit final test hardening**

```bash
git add apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.test.ts \
  apps/backend/src/agent/tools/sub-agent/subagent-history.test.ts \
  apps/backend/src/agent/tools/sub-agent/subagent-runner.test.ts \
  apps/backend/src/agent/tools/sub-agent/resume-subagent-tool.test.ts
git commit -m "test(subagent): cover resume edge cases"
```

---

## Self-Review Checklist

- Spec coverage: Tasks cover sidecar metadata, no `agentType` resume parameter, immutable copied resume directories, copied LLM messages, copied SSE events, shared runner, fresh dispatch sidecar writing, resume tool registration, and no frontend changes.
- Placeholder scan: The plan contains concrete file paths, code snippets, commands, and expected outcomes for each task.
- Type consistency: Shared names are `SubAgentType`, `DispatchAgentResult`, `SubagentMetadata`, `PreparedResumedSubagentState`, `subagentSseEventStartIndex`, `createFreshSubagent()`, `runSubagentTurn()`, and `prepareResumedSubagentState()`.
