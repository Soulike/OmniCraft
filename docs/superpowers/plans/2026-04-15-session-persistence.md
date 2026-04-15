# Session Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add disk-backed persistence to agent sessions so they survive server restarts.

**Architecture:** File-backed AgentSseLog with three-state model (cold/hot/in-memory), atomic snapshot writes on done/title events, lazy-loading AgentStore with LRU eviction. All persistence flows through the existing Mutex pattern.

**Tech Stack:** Node.js fs/promises, Vitest, existing Mutex helper

**Spec:** `docs/superpowers/specs/2026-04-15-session-persistence-design.md`

---

## File Structure

| Action | File                                                          | Responsibility                                                                                           |
| ------ | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Modify | `apps/backend/src/agent-core/agent/agent-sse-log.ts`          | Add filePath, three-state model, async append, ensureLoaded, unload, activeReaderCount                   |
| Modify | `apps/backend/src/agent-core/agent/agent-sse-log.test.ts`     | Add file-backed tests alongside existing in-memory tests                                                 |
| Modify | `apps/backend/src/agent-core/agent/types.ts`                  | Add `extraAllowedPaths` to AgentSnapshotOptions, add `sessionsDir` to AgentOptions                       |
| Modify | `apps/backend/src/agent-core/agent/agent.ts`                  | Path helpers, sseLog construction, persistSnapshot, isRunning, loadSnapshotFromDisk, reconcileEventsFile |
| Create | `apps/backend/src/agent-core/agent/agent-persistence.test.ts` | Tests for loadSnapshotFromDisk, reconcileEventsFile, persistSnapshot                                     |
| Modify | `apps/backend/src/agent/agents/main-agent/main-agent.ts`      | Add restore(), update constructor for snapshot+sessionsDir                                               |
| Modify | `apps/backend/src/models/agent-store/agent-store.ts`          | Async get/has/delete, lazy loading, LRU eviction                                                         |
| Create | `apps/backend/src/models/agent-store/agent-store.test.ts`     | Tests for lazy loading, dedup, eviction, delete                                                          |
| Modify | `apps/backend/src/services/chat/chat-service.ts`              | Async propagation, pass sessionsDir                                                                      |
| Modify | `apps/backend/src/dispatcher/chat/router.ts`                  | Add await on chatService calls                                                                           |
| Modify | `apps/backend/src/startup/init-services.ts`                   | Compute sessionsDir, pass to AgentStore.create()                                                         |

---

### Task 1: AgentSseLog — async append with file backing

**Files:**

- Modify: `apps/backend/src/agent-core/agent/agent-sse-log.ts`
- Modify: `apps/backend/src/agent-core/agent/agent-sse-log.test.ts`

- [ ] **Step 1: Write failing tests for file-backed append**

Add a new `describe('file-backed mode')` block in `agent-sse-log.test.ts`:

```typescript
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

describe('file-backed mode', () => {
  let tmpDir: string;
  let filePath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'asl-test-'));
    filePath = path.join(tmpDir, 'sse-events.jsonl');
  });

  afterEach(async () => {
    await rm(tmpDir, {recursive: true, force: true});
  });

  it('writes each event as a JSON line to the file', async () => {
    const log = new AgentSseLog(filePath);
    await log.append(textDelta('a'));
    await log.append(textDelta('b'));

    const content = await readFile(filePath, 'utf-8');
    const lines = content.trimEnd().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0])).toEqual(textDelta('a'));
    expect(JSON.parse(lines[1])).toEqual(textDelta('b'));
  });

  it('creates parent directory if it does not exist', async () => {
    const nestedPath = path.join(tmpDir, 'nested', 'dir', 'sse-events.jsonl');
    const log = new AgentSseLog(nestedPath);
    await log.append(textDelta('a'));

    const content = await readFile(nestedPath, 'utf-8');
    expect(content.trimEnd()).toBe(JSON.stringify(textDelta('a')));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/backend && bun run test -- src/agent-core/agent/agent-sse-log.test.ts`
Expected: FAIL — `AgentSseLog` constructor does not accept `filePath`

- [ ] **Step 3: Implement file-backed append**

In `agent-sse-log.ts`, add the file-backed logic:

```typescript
import {appendFile, mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';

import {Mutex} from '@/helpers/mutex.js';

export class AgentSseLog {
  private readonly events: SseEvent[] = [];
  private readonly newEventWaiters = new Set<() => void>();
  private readonly filePath: string | null;
  private readonly mutex = new Mutex();

  constructor(filePath?: string) {
    this.filePath = filePath ?? null;
  }

  get length(): number {
    return this.events.length;
  }

  async append(event: SseEvent): Promise<void> {
    if (!this.filePath) {
      this.events.push(event);
      this.notifyWaiters();
      return;
    }

    const release = await this.mutex.acquire();
    try {
      await mkdir(path.dirname(this.filePath), {recursive: true});
      await appendFile(this.filePath, JSON.stringify(event) + '\n');

      if (this.loaded) {
        this.events.push(event);
        this.notifyWaiters();
      }
    } finally {
      release();
    }
  }

  // ... rest unchanged for now (loaded flag, etc. come in Task 2)
```

Add a `private loaded = false` flag. When no filePath, `loaded` is always effectively true (in-memory mode uses the array directly). Set `loaded = true` initially only for in-memory mode:

```typescript
  private loaded: boolean;

  constructor(filePath?: string) {
    this.filePath = filePath ?? null;
    this.loaded = !this.filePath; // in-memory mode is always "loaded"
  }
```

- [ ] **Step 4: Update existing tests for async append**

The existing in-memory tests call `log.append(...)` synchronously. Since `append` is now `async`, add `await`:

```typescript
// Before:
log.append(textDelta('a'));
// After:
await log.append(textDelta('a'));
```

Apply this to all existing `append` calls in the test file. The in-memory behavior is unchanged — `await` on an immediately-resolving promise is transparent.

- [ ] **Step 5: Run all tests to verify they pass**

Run: `cd apps/backend && bun run test -- src/agent-core/agent/agent-sse-log.test.ts`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/agent-core/agent/agent-sse-log.ts apps/backend/src/agent-core/agent/agent-sse-log.test.ts
git commit -m "feat(backend): add file-backed append to AgentSseLog"
```

---

### Task 2: AgentSseLog — ensureLoaded, unload, activeReaderCount

**Files:**

- Modify: `apps/backend/src/agent-core/agent/agent-sse-log.ts`
- Modify: `apps/backend/src/agent-core/agent/agent-sse-log.test.ts`

- [ ] **Step 1: Write failing tests for the three-state model**

Add to the `describe('file-backed mode')` block:

```typescript
it('cold append does not populate in-memory array', async () => {
  const log = new AgentSseLog(filePath);
  await log.append(textDelta('a'));
  await log.append(textDelta('b'));

  // length reflects in-memory array, which is empty in cold mode
  expect(log.length).toBe(0);
  expect(log.activeReaderCount).toBe(0);
});

it('first reader triggers ensureLoaded and can read historical events', async () => {
  const log = new AgentSseLog(filePath);
  await log.append(textDelta('a'));
  await log.append(textDelta('b'));

  const controller = new AbortController();
  const collected = collect(log.createReader({signal: controller.signal}));

  await new Promise((r) => setTimeout(r, 10));
  expect(log.activeReaderCount).toBe(1);
  expect(log.length).toBe(2); // now loaded

  controller.abort();
  const events = await collected;
  expect(events).toEqual([textDelta('a'), textDelta('b')]);
});

it('last reader leaving triggers unload', async () => {
  const log = new AgentSseLog(filePath);
  await log.append(textDelta('a'));

  const controller = new AbortController();
  const collected = collect(log.createReader({signal: controller.signal}));

  await new Promise((r) => setTimeout(r, 10));
  expect(log.length).toBe(1); // loaded

  controller.abort();
  await collected;

  // After reader exits, memory is released
  expect(log.activeReaderCount).toBe(0);
  expect(log.length).toBe(0); // unloaded
});

it('hot append writes to both file and memory', async () => {
  const log = new AgentSseLog(filePath);
  await log.append(textDelta('a'));

  const controller = new AbortController();
  const collected = collect(log.createReader({signal: controller.signal}));
  await new Promise((r) => setTimeout(r, 10));

  // Now in hot mode — append should go to both file and memory
  await log.append(textDelta('b'));

  await new Promise((r) => setTimeout(r, 10));
  controller.abort();

  const events = await collected;
  expect(events).toEqual([textDelta('a'), textDelta('b')]);

  // Verify file has both events
  const content = await readFile(filePath, 'utf-8');
  const lines = content.trimEnd().split('\n');
  expect(lines).toHaveLength(2);
});

it('after unload, new append only writes to file', async () => {
  const log = new AgentSseLog(filePath);
  await log.append(textDelta('a'));

  // Load and unload
  const controller = new AbortController();
  const collected = collect(log.createReader({signal: controller.signal}));
  await new Promise((r) => setTimeout(r, 10));
  controller.abort();
  await collected;

  // Now back to cold mode
  await log.append(textDelta('b'));
  expect(log.length).toBe(0); // cold — not in memory

  // File has both events
  const content = await readFile(filePath, 'utf-8');
  const lines = content.trimEnd().split('\n');
  expect(lines).toHaveLength(2);
});

it('ensureLoaded discards corrupted last line and rewrites file', async () => {
  // Manually write a file with a corrupted last line
  await mkdir(path.dirname(filePath), {recursive: true});
  const validLine = JSON.stringify(textDelta('a'));
  await writeFile(filePath, validLine + '\n' + 'corrupted{json\n');

  const log = new AgentSseLog(filePath);
  const controller = new AbortController();
  const collected = collect(log.createReader({signal: controller.signal}));

  await new Promise((r) => setTimeout(r, 10));
  controller.abort();

  const events = await collected;
  expect(events).toEqual([textDelta('a')]);

  // File should be rewritten without the corrupted line
  const content = await readFile(filePath, 'utf-8');
  expect(content).toBe(validLine + '\n');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/backend && bun run test -- src/agent-core/agent/agent-sse-log.test.ts`
Expected: FAIL — `activeReaderCount` not defined, `length` returns wrong values, etc.

- [ ] **Step 3: Implement ensureLoaded, unload, and activeReaderCount**

Update `agent-sse-log.ts`:

```typescript
export class AgentSseLog {
  private readonly events: SseEvent[] = [];
  private readonly newEventWaiters = new Set<() => void>();
  private readonly filePath: string | null;
  private readonly mutex = new Mutex();
  private loaded: boolean;
  private readerCount = 0;

  constructor(filePath?: string) {
    this.filePath = filePath ?? null;
    this.loaded = !this.filePath;
  }

  get length(): number {
    return this.events.length;
  }

  get activeReaderCount(): number {
    return this.readerCount;
  }

  async append(event: SseEvent): Promise<void> {
    if (!this.filePath) {
      this.events.push(event);
      this.notifyWaiters();
      return;
    }

    const release = await this.mutex.acquire();
    try {
      await mkdir(path.dirname(this.filePath), {recursive: true});
      await appendFile(this.filePath, JSON.stringify(event) + '\n');

      if (this.loaded) {
        this.events.push(event);
        this.notifyWaiters();
      }
    } finally {
      release();
    }
  }

  createReader(options?: AgentSseLogReaderOptions): AsyncIterable<SseEvent> {
    const startIndex = options?.startIndex ?? 0;
    assert(startIndex >= 0, 'startIndex must be non-negative');
    const signal = options?.signal;
    return {
      [Symbol.asyncIterator]: () => this.readerIterator(startIndex, signal),
    };
  }

  private async *readerIterator(
    cursor: number,
    signal?: AbortSignal,
  ): AsyncIterableIterator<SseEvent> {
    this.readerCount++;
    if (this.readerCount === 1 && this.filePath && !this.loaded) {
      await this.ensureLoaded();
    }
    try {
      if (signal?.aborted) return;

      for (;;) {
        while (cursor < this.events.length) {
          yield this.events[cursor];
          cursor++;
          if (signal?.aborted) return;
        }

        const aborted = await this.waitForAppendOrAbort(signal);
        if (aborted) return;
      }
    } finally {
      this.readerCount--;
      if (this.readerCount === 0 && this.filePath) {
        this.unload();
      }
    }
  }

  private async ensureLoaded(): Promise<void> {
    assert(this.filePath, 'ensureLoaded called without filePath');
    const release = await this.mutex.acquire();
    try {
      let content: string;
      try {
        content = await readFile(this.filePath, 'utf-8');
      } catch (error: unknown) {
        if (
          error instanceof Error &&
          'code' in error &&
          error.code === 'ENOENT'
        ) {
          this.loaded = true;
          return;
        }
        throw error;
      }

      if (!content.trim()) {
        this.loaded = true;
        return;
      }

      const lines = content.trimEnd().split('\n');
      let needsRewrite = false;

      for (let i = 0; i < lines.length; i++) {
        try {
          const event: SseEvent = JSON.parse(lines[i]);
          this.events.push(event);
        } catch {
          // If last line is corrupted, discard it
          if (i === lines.length - 1) {
            needsRewrite = true;
          } else {
            // Non-last line corrupted — still discard but unexpected
            needsRewrite = true;
          }
        }
      }

      if (needsRewrite) {
        const cleaned =
          this.events.map((e) => JSON.stringify(e)).join('\n') +
          (this.events.length > 0 ? '\n' : '');
        await writeFile(this.filePath, cleaned);
      }

      this.loaded = true;
    } finally {
      release();
    }
  }

  private unload(): void {
    this.events.length = 0;
    this.newEventWaiters.clear();
    this.loaded = false;
  }

  // waitForAppendOrAbort and notifyWaiters remain unchanged
}
```

- [ ] **Step 4: Run all tests to verify they pass**

Run: `cd apps/backend && bun run test -- src/agent-core/agent/agent-sse-log.test.ts`
Expected: All tests PASS (both existing in-memory and new file-backed)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/agent-core/agent/agent-sse-log.ts apps/backend/src/agent-core/agent/agent-sse-log.test.ts
git commit -m "feat(backend): add three-state model to AgentSseLog (cold/hot/in-memory)"
```

---

### Task 3: Types — extend AgentSnapshotOptions and AgentOptions

**Files:**

- Modify: `apps/backend/src/agent-core/agent/types.ts`

- [ ] **Step 1: Update type definitions**

In `types.ts`, add `extraAllowedPaths` to `AgentSnapshotOptions`, add `sessionsDir` to `AgentOptions`, and add Zod schemas for snapshot validation:

```typescript
import {z} from 'zod';

import type {AllowedPathEntry} from '../tool/index.js';

// ---------------------------------------------------------------------------
// Agent Snapshot Schema (for disk validation)
// ---------------------------------------------------------------------------

const allowedPathEntrySchema = z.object({
  path: z.string(),
  mode: z.enum(['read-only', 'read-write']),
});

const agentSnapshotOptionsSchema = z.object({
  workingDirectory: z.string(),
  claudeCodeSessionId: z.string().optional(),
  extraAllowedPaths: z.array(allowedPathEntrySchema).optional(),
});

const llmMessageSchema = z.object({
  id: z.string(),
  createdAt: z.number(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
});

const llmSessionSnapshotSchema = z.object({
  id: z.string(),
  messages: z.array(llmMessageSchema),
});

export const agentSnapshotSchema = z.object({
  id: z.string(),
  title: z.string(),
  llmSession: llmSessionSnapshotSchema,
  options: agentSnapshotOptionsSchema,
});

// ---------------------------------------------------------------------------
// Agent Snapshot Types
// ---------------------------------------------------------------------------

export interface AgentSnapshotOptions {
  workingDirectory: string;
  claudeCodeSessionId?: string;
  extraAllowedPaths?: readonly AllowedPathEntry[];
}

export interface AgentOptions {
  readonly toolRegistries: ToolRegistry[];
  readonly skillRegistries: SkillRegistry[];
  readonly baseSystemPrompt: string;
  readonly getMaxToolRounds: () => Promise<number> | number;
  readonly getLightConfig?: () => Promise<LlmConfig>;
  readonly workingDirectory: string;
  readonly extraAllowedPaths: readonly AllowedPathEntry[];
  readonly sessionsDir?: string;
}
```

Note: The `llmMessageSchema` should match the actual `LlmMessage` type from `llm-session/types.ts`. Check the real type and adjust the schema fields accordingly during implementation.

- [ ] **Step 2: Run typecheck to verify no breakage**

Run: `cd apps/backend && bun run typecheck`
Expected: PASS — new fields are optional, no existing code breaks

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/agent-core/agent/types.ts
git commit -m "feat(backend): add extraAllowedPaths to snapshot, sessionsDir to AgentOptions"
```

---

### Task 4: Agent — path helpers, sseLog construction, persistSnapshot, isRunning

**Files:**

- Modify: `apps/backend/src/agent-core/agent/agent.ts`

- [ ] **Step 1: Add path helpers and sessionsDir storage**

Add private static methods and store sessionsDir in the Agent class:

```typescript
import {mkdir, rename, writeFile} from 'node:fs/promises';
import path from 'node:path';

export abstract class Agent {
  // ... existing fields ...

  private readonly sessionsDir: string | null;

  private static snapshotPath(sessionsDir: string, id: string): string {
    return path.join(sessionsDir, id, 'snapshot.json');
  }

  private static eventsPath(sessionsDir: string, id: string): string {
    return path.join(sessionsDir, id, 'sse-events.jsonl');
  }
```

- [ ] **Step 2: Update constructor for sseLog and sessionsDir**

Change `readonly sseLog = new AgentSseLog()` from a field initializer to constructor body assignment. Store `sessionsDir`. Accept `snapshot` as optional third parameter:

```typescript
  readonly sseLog: AgentSseLog;

  constructor(
    getConfig: () => Promise<LlmConfig>,
    options: AgentOptions,
    snapshot?: AgentSnapshot,
  ) {
    this.sessionsDir = options.sessionsDir ?? null;

    // ... existing options storage ...

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

    this.sseLog = this.sessionsDir
      ? new AgentSseLog(Agent.eventsPath(this.sessionsDir, this.id))
      : new AgentSseLog();

    this.shellState = {cwd: this.workingDirectory};
    agentEventBus.emit('agent-created', this);
  }
```

- [ ] **Step 3: Add persistSnapshot method**

```typescript
  private async persistSnapshot(): Promise<void> {
    if (!this.sessionsDir) return;
    const filePath = Agent.snapshotPath(this.sessionsDir, this.id);
    const dir = path.dirname(filePath);
    await mkdir(dir, {recursive: true});
    const tmpPath = filePath + '.tmp';
    const data = JSON.stringify(this.toSnapshot(), null, 2) + '\n';
    await writeFile(tmpPath, data);
    await rename(tmpPath, filePath);
  }
```

- [ ] **Step 4: Update toSnapshot to include extraAllowedPaths**

```typescript
  toSnapshot(): AgentSnapshot {
    return {
      id: this.id,
      title: this.title,
      llmSession: this.llmSession.toSnapshot(),
      options: {
        workingDirectory: this.workingDirectory,
        extraAllowedPaths: this.extraAllowedPaths.filter(
          (p) => p.path !== os.tmpdir(),
        ),
      },
    };
  }
```

Filter out `os.tmpdir()` because it's always added in the constructor.

- [ ] **Step 5: Update pump onEvent to trigger persistSnapshot**

In `runTurn`, update the `onEvent` callback to also persist snapshot on `done` and `session-title`:

```typescript
  private async runTurn(
    userMessage: string,
    thinkingLevel: ThinkingLevel,
  ): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      this.abortController = new AbortController();
      const stream = this.runAgentLoop(
        userMessage,
        thinkingLevel,
        this.abortController.signal,
      );
      await this.pump(stream, (event) => {
        if (event.type === 'done' || event.type === 'session-title') {
          void this.persistSnapshot();
        }
        if (
          event.type === 'done' &&
          event.reason === 'complete' &&
          !this.title &&
          !this.isGeneratingTitle
        ) {
          this.isGeneratingTitle = true;
          void this.generateAndEmitTitle().finally(() => {
            this.isGeneratingTitle = false;
          });
        }
      });
    } finally {
      this.abortController = null;
      release();
    }
  }
```

- [ ] **Step 6: Update pump for async append**

```typescript
  private async pump(
    stream: AgentEventStream,
    onEvent?: (event: SseEvent) => void,
  ): Promise<void> {
    try {
      for await (const event of stream) {
        await this.sseLog.append(event);
        onEvent?.(event);
      }
    } catch {
      await this.sseLog.append({
        type: 'error',
        message: 'An internal error occurred',
      });
    }
  }
```

- [ ] **Step 7: Add isRunning getter**

```typescript
  get isRunning(): boolean {
    return this.abortController !== null || this.isGeneratingTitle;
  }
```

- [ ] **Step 8: Add loadSnapshotFromDisk and reconcileEventsFile**

```typescript
  protected static async loadSnapshotFromDisk(
    sessionsDir: string,
    id: string,
  ): Promise<AgentSnapshot> {
    const filePath = Agent.snapshotPath(sessionsDir, id);
    const content = await readFile(filePath, 'utf-8');
    const raw: unknown = JSON.parse(content);
    return agentSnapshotSchema.parse(raw);
  }

  protected static async reconcileEventsFile(
    sessionsDir: string,
    id: string,
  ): Promise<void> {
    const filePath = Agent.eventsPath(sessionsDir, id);
    let content: string;
    try {
      content = await readFile(filePath, 'utf-8');
    } catch (error: unknown) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return;
      }
      throw error;
    }

    if (!content.trim()) return;

    const lines = content.trimEnd().split('\n');
    const validEvents: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      try {
        const event: SseEvent = JSON.parse(lines[i]);
        validEvents.push(lines[i]);
        // We only care about the raw line, not the parsed event,
        // except to find the last 'done'
      } catch {
        // Corrupted line — skip (only expected for last line)
      }
    }

    // Find last 'done' event index
    let lastDoneIndex = -1;
    for (let i = validEvents.length - 1; i >= 0; i--) {
      const event = JSON.parse(validEvents[i]) as SseEvent;
      if (event.type === 'done') {
        lastDoneIndex = i;
        break;
      }
    }

    if (lastDoneIndex === -1) {
      // No done event — clear the file
      await writeFile(filePath, '');
      return;
    }

    const truncated = validEvents.slice(0, lastDoneIndex + 1);
    if (truncated.length !== lines.length || validEvents.length !== lines.length) {
      await writeFile(filePath, truncated.join('\n') + '\n');
    }
  }
```

Add `readFile` to the import from `node:fs/promises`.

- [ ] **Step 9: Run typecheck**

Run: `cd apps/backend && bun run typecheck`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add apps/backend/src/agent-core/agent/agent.ts
git commit -m "feat(backend): add persistence to Agent (snapshot, sseLog, path helpers, reconcile)"
```

---

### Task 5: Agent persistence tests

**Files:**

- Create: `apps/backend/src/agent-core/agent/agent-persistence.test.ts`

- [ ] **Step 1: Write tests for loadSnapshotFromDisk**

```typescript
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type {AgentSnapshot} from './types.js';

import {describe, expect, it, beforeEach, afterEach} from 'vitest';

// We need to access protected static methods for testing.
// Use a concrete subclass or access via bracket notation.
import {Agent} from './agent.js';

/** Minimal valid snapshot for testing. */
function createTestSnapshot(id: string): AgentSnapshot {
  return {
    id,
    title: 'Test Session',
    llmSession: {id: 'llm-session-id', messages: []},
    options: {workingDirectory: '/tmp/test'},
  };
}

// Access protected statics via subclass
class TestAgent extends Agent {
  static loadSnapshot(sessionsDir: string, id: string) {
    return Agent.loadSnapshotFromDisk(sessionsDir, id);
  }
  static reconcileEvents(sessionsDir: string, id: string) {
    return Agent.reconcileEventsFile(sessionsDir, id);
  }
}

describe('Agent persistence', () => {
  let sessionsDir: string;

  beforeEach(async () => {
    sessionsDir = await mkdtemp(path.join(os.tmpdir(), 'ap-test-'));
  });

  afterEach(async () => {
    await rm(sessionsDir, {recursive: true, force: true});
  });

  describe('loadSnapshotFromDisk', () => {
    it('reads and parses snapshot.json', async () => {
      const id = 'test-id';
      const sessionDir = path.join(sessionsDir, id);
      await mkdir(sessionDir, {recursive: true});

      const snapshot = createTestSnapshot(id);
      await writeFile(
        path.join(sessionDir, 'snapshot.json'),
        JSON.stringify(snapshot, null, 2),
      );

      const loaded = await TestAgent.loadSnapshot(sessionsDir, id);
      expect(loaded).toEqual(snapshot);
    });
  });

  describe('reconcileEventsFile', () => {
    const id = 'test-id';

    async function writeEvents(events: string[]): Promise<string> {
      const sessionDir = path.join(sessionsDir, id);
      await mkdir(sessionDir, {recursive: true});
      const filePath = path.join(sessionDir, 'sse-events.jsonl');
      await writeFile(filePath, events.join('\n') + '\n');
      return filePath;
    }

    const textEvent = JSON.stringify({type: 'text-delta', content: 'hello'});
    const doneEvent = JSON.stringify({
      type: 'done',
      reason: 'complete',
      usage: {
        model: 'test',
        maxInputTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadInputTokens: 0,
      },
    });

    it('keeps events up to and including last done', async () => {
      const filePath = await writeEvents([textEvent, doneEvent, textEvent]);
      await TestAgent.reconcileEvents(sessionsDir, id);

      const content = await readFile(filePath, 'utf-8');
      const lines = content.trimEnd().split('\n');
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[1]).type).toBe('done');
    });

    it('clears file when no done event exists', async () => {
      const filePath = await writeEvents([textEvent, textEvent]);
      await TestAgent.reconcileEvents(sessionsDir, id);

      const content = await readFile(filePath, 'utf-8');
      expect(content).toBe('');
    });

    it('discards corrupted last line before truncating', async () => {
      const sessionDir = path.join(sessionsDir, id);
      await mkdir(sessionDir, {recursive: true});
      const filePath = path.join(sessionDir, 'sse-events.jsonl');
      await writeFile(
        filePath,
        textEvent + '\n' + doneEvent + '\n' + 'corrupted{\n',
      );

      await TestAgent.reconcileEvents(sessionsDir, id);

      const content = await readFile(filePath, 'utf-8');
      const lines = content.trimEnd().split('\n');
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[1]).type).toBe('done');
    });

    it('does nothing when events file does not exist', async () => {
      await mkdir(path.join(sessionsDir, id), {recursive: true});
      // Should not throw
      await TestAgent.reconcileEvents(sessionsDir, id);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd apps/backend && bun run test -- src/agent-core/agent/agent-persistence.test.ts`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/agent-core/agent/agent-persistence.test.ts
git commit -m "test(backend): add tests for Agent.loadSnapshotFromDisk and reconcileEventsFile"
```

---

### Task 6: MainAgent — restore and constructor update

**Files:**

- Modify: `apps/backend/src/agent/agents/main-agent/main-agent.ts`

- [ ] **Step 1: Update MainAgent constructor to accept snapshot**

```typescript
import type {AllowedPathEntry} from '@omnicraft/settings-schema';

import {CoreSkillRegistry} from '@/agent/skills/index.js';
import {
  BashToolRegistry,
  ClientToolRegistry,
  CoreToolRegistry,
  FileToolRegistry,
  SubAgentToolRegistry,
  WebToolRegistry,
} from '@/agent/tools/index.js';
import {Agent} from '@/agent-core/agent/index.js';
import type {LlmConfig} from '@/agent-core/llm-api/index.js';
import type {AgentSnapshot} from '@/agent-core/agent/types.js';
import {settingsService} from '@/services/settings/index.js';

export class MainAgent extends Agent {
  constructor(
    getConfig: () => Promise<LlmConfig>,
    workingDirectory: string,
    extraAllowedPaths: readonly AllowedPathEntry[] = [],
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
          SubAgentToolRegistry.getInstance(),
          ClientToolRegistry.getInstance(),
        ],
        skillRegistries: [CoreSkillRegistry.getInstance()],
        baseSystemPrompt: 'You are a helpful assistant.',
        getMaxToolRounds: async () => {
          const settings = await settingsService.getAll();
          return settings.agent.maxToolRounds;
        },
        getLightConfig: async () => {
          const settings = await settingsService.getAll();
          const {apiFormat, apiKey, baseUrl, model, lightModel} = settings.llm;
          return {apiFormat, apiKey, baseUrl, model: lightModel || model};
        },
        workingDirectory,
        extraAllowedPaths,
        sessionsDir,
      },
      snapshot,
    );
  }

  static async restore(
    getConfig: () => Promise<LlmConfig>,
    sessionsDir: string,
    id: string,
  ): Promise<MainAgent> {
    const snapshot = await Agent.loadSnapshotFromDisk(sessionsDir, id);
    await Agent.reconcileEventsFile(sessionsDir, id);
    return new MainAgent(
      getConfig,
      snapshot.options.workingDirectory,
      snapshot.options.extraAllowedPaths ?? [],
      sessionsDir,
      snapshot,
    );
  }
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd apps/backend && bun run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/agent/agents/main-agent/main-agent.ts
git commit -m "feat(backend): add MainAgent.restore() and sessionsDir support"
```

---

### Task 7: AgentStore — async interface, lazy loading, LRU eviction

**Files:**

- Modify: `apps/backend/src/models/agent-store/agent-store.ts`
- Create: `apps/backend/src/models/agent-store/agent-store.test.ts`

- [ ] **Step 1: Write failing tests for async AgentStore**

```typescript
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import type {Agent} from '@/agent-core/agent/index.js';
import {agentEventBus} from '@/agent-core/events/index.js';

import {AgentStore} from './agent-store.js';

/** Creates a minimal mock agent. */
function createMockAgent(id: string, overrides?: Partial<Agent>): Agent {
  return {
    id,
    title: '',
    sseLog: {activeReaderCount: 0},
    get isRunning() {
      return false;
    },
    ...overrides,
  } as Agent;
}

describe('AgentStore', () => {
  let sessionsDir: string;

  beforeEach(async () => {
    sessionsDir = await mkdtemp(path.join(os.tmpdir(), 'as-test-'));
    AgentStore.resetInstance();
  });

  afterEach(async () => {
    AgentStore.resetInstance();
    await rm(sessionsDir, {recursive: true, force: true});
  });

  describe('lazy loading', () => {
    it('loads agent from disk on cache miss', async () => {
      const id = 'lazy-load-id';
      const mockAgent = createMockAgent(id);
      const restoreAgent = vi.fn().mockResolvedValue(mockAgent);

      const store = AgentStore.create(sessionsDir, restoreAgent);

      // Create session directory on disk
      await mkdir(path.join(sessionsDir, id), {recursive: true});
      await writeFile(path.join(sessionsDir, id, 'snapshot.json'), '{}');

      const agent = await store.get(id);
      expect(agent).toBe(mockAgent);
      expect(restoreAgent).toHaveBeenCalledWith(sessionsDir, id);
    });

    it('returns undefined when session dir does not exist', async () => {
      const restoreAgent = vi.fn();
      const store = AgentStore.create(sessionsDir, restoreAgent);

      const agent = await store.get('nonexistent');
      expect(agent).toBeUndefined();
      expect(restoreAgent).not.toHaveBeenCalled();
    });

    it('deduplicates concurrent loads for same id', async () => {
      const id = 'dedup-id';
      const mockAgent = createMockAgent(id);
      const restoreAgent = vi.fn().mockResolvedValue(mockAgent);

      const store = AgentStore.create(sessionsDir, restoreAgent);
      await mkdir(path.join(sessionsDir, id), {recursive: true});
      await writeFile(path.join(sessionsDir, id, 'snapshot.json'), '{}');

      const [a, b] = await Promise.all([store.get(id), store.get(id)]);
      expect(a).toBe(b);
      expect(restoreAgent).toHaveBeenCalledTimes(1);
    });
  });

  describe('has', () => {
    it('returns true for in-memory agent', async () => {
      const restoreAgent = vi.fn();
      const store = AgentStore.create(sessionsDir, restoreAgent);
      store.set(createMockAgent('in-memory'));

      expect(await store.has('in-memory')).toBe(true);
      expect(restoreAgent).not.toHaveBeenCalled();
    });

    it('returns true for on-disk session without loading', async () => {
      const restoreAgent = vi.fn();
      const store = AgentStore.create(sessionsDir, restoreAgent);
      await mkdir(path.join(sessionsDir, 'on-disk'), {recursive: true});

      expect(await store.has('on-disk')).toBe(true);
      expect(restoreAgent).not.toHaveBeenCalled();
    });

    it('returns false when not in memory or on disk', async () => {
      const store = AgentStore.create(sessionsDir, vi.fn());
      expect(await store.has('nope')).toBe(false);
    });
  });

  describe('delete', () => {
    it('removes from memory and disk', async () => {
      const id = 'delete-me';
      const restoreAgent = vi.fn();
      const store = AgentStore.create(sessionsDir, restoreAgent);

      store.set(createMockAgent(id));
      const sessionDir = path.join(sessionsDir, id);
      await mkdir(sessionDir, {recursive: true});
      await writeFile(path.join(sessionDir, 'snapshot.json'), '{}');

      const result = await store.delete(id);
      expect(result).toBe(true);
      expect(await store.has(id)).toBe(false);
    });
  });

  describe('LRU eviction', () => {
    it('evicts oldest inactive agent when over limit', async () => {
      const restoreAgent = vi.fn();
      // Use a small limit for testing by accessing internals or creating many agents
      const store = AgentStore.create(sessionsDir, restoreAgent);

      // Add agents up to limit + 1, verify the oldest is evicted
      // This test depends on MAX_CACHED_AGENTS — for a focused test,
      // we can test the eviction logic by adding 51 agents and checking
      // the first one is evicted (returned by get but re-loaded from disk)
      // For practical test, add a few and check the eviction method works:
      const agents: Agent[] = [];
      for (let i = 0; i < 51; i++) {
        const agent = createMockAgent(`agent-${i}`);
        agents.push(agent);
        store.set(agent);
        // Small delay so lastAccessedAt differs
      }

      // Agent 0 should have been evicted (oldest, not running, no readers)
      // Direct memory check is internal — verify via get triggering a load
      await mkdir(path.join(sessionsDir, 'agent-0'), {recursive: true});
      await writeFile(path.join(sessionsDir, 'agent-0', 'snapshot.json'), '{}');
      restoreAgent.mockResolvedValue(createMockAgent('agent-0'));

      const reloaded = await store.get('agent-0');
      expect(restoreAgent).toHaveBeenCalledWith(sessionsDir, 'agent-0');
    });

    it('skips running agents during eviction', async () => {
      const restoreAgent = vi.fn();
      const store = AgentStore.create(sessionsDir, restoreAgent);

      // Fill to limit with one running agent as the oldest
      const runningAgent = createMockAgent('running', {
        get isRunning() {
          return true;
        },
      } as Partial<Agent>);
      store.set(runningAgent);

      for (let i = 1; i <= 50; i++) {
        store.set(createMockAgent(`agent-${i}`));
      }

      // The running agent should NOT be evicted, agent-1 should be
      await mkdir(path.join(sessionsDir, 'running'), {recursive: true});
      // Verify running agent is still in memory (no restore call)
      const agent = await store.get('running');
      expect(agent).toBe(runningAgent);
      expect(restoreAgent).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/backend && bun run test -- src/models/agent-store/agent-store.test.ts`
Expected: FAIL — `AgentStore.create()` doesn't accept `sessionsDir` and `restoreAgent`

- [ ] **Step 3: Implement async AgentStore with lazy loading and LRU**

```typescript
import assert from 'node:assert';
import {access, rm} from 'node:fs/promises';
import path from 'node:path';

import type {Agent} from '@/agent-core/agent/index.js';
import {agentEventBus} from '@/agent-core/events/index.js';

const MAX_CACHED_AGENTS = 50;

interface CacheEntry {
  agent: Agent;
  lastAccessedAt: number;
}

type RestoreAgent = (sessionsDir: string, id: string) => Promise<Agent>;

export class AgentStore {
  private static instance: AgentStore | null = null;

  private readonly cache = new Map<string, CacheEntry>();
  private readonly loadingPromises = new Map<
    string,
    Promise<Agent | undefined>
  >();
  private readonly _sessionsDir: string;
  private readonly restoreAgent: RestoreAgent;

  private readonly onAgentCreated = (agent: Agent): void => {
    this.set(agent);
  };

  private constructor(sessionsDir: string, restoreAgent: RestoreAgent) {
    this._sessionsDir = sessionsDir;
    this.restoreAgent = restoreAgent;
  }

  /** The root directory for session persistence. */
  get sessionsDir(): string {
    return this._sessionsDir;
  }

  static getInstance(): AgentStore {
    assert(
      AgentStore.instance !== null,
      'AgentStore is not initialized. Call AgentStore.create() first.',
    );
    return AgentStore.instance;
  }

  static create(sessionsDir: string, restoreAgent: RestoreAgent): AgentStore {
    assert(AgentStore.instance === null, 'AgentStore is already initialized.');
    const store = new AgentStore(sessionsDir, restoreAgent);
    AgentStore.instance = store;
    agentEventBus.on('agent-created', store.onAgentCreated);
    return store;
  }

  static resetInstance(): void {
    if (AgentStore.instance) {
      agentEventBus.off('agent-created', AgentStore.instance.onAgentCreated);
    }
    AgentStore.instance = null;
  }

  set(agent: Agent): void {
    this.cache.set(agent.id, {agent, lastAccessedAt: Date.now()});
    this.evictIfNeeded();
  }

  async get(id: string): Promise<Agent | undefined> {
    const entry = this.cache.get(id);
    if (entry) {
      entry.lastAccessedAt = Date.now();
      return entry.agent;
    }

    // Check for in-flight load
    const existing = this.loadingPromises.get(id);
    if (existing) return existing;

    // Check disk
    const loadPromise = this.loadFromDisk(id);
    this.loadingPromises.set(id, loadPromise);
    try {
      return await loadPromise;
    } finally {
      this.loadingPromises.delete(id);
    }
  }

  async has(id: string): Promise<boolean> {
    if (this.cache.has(id)) return true;
    return this.existsOnDisk(id);
  }

  async delete(id: string): Promise<boolean> {
    this.cache.delete(id);
    const sessionDir = path.join(this._sessionsDir, id);
    try {
      await rm(sessionDir, {recursive: true, force: true});
      return true;
    } catch {
      return false;
    }
  }

  private async loadFromDisk(id: string): Promise<Agent | undefined> {
    if (!(await this.existsOnDisk(id))) return undefined;
    const agent = await this.restoreAgent(this._sessionsDir, id);
    // Agent constructor emits 'agent-created' which calls set(),
    // so the agent is already in cache. Update lastAccessedAt.
    const entry = this.cache.get(id);
    if (entry) {
      entry.lastAccessedAt = Date.now();
    }
    return agent;
  }

  private async existsOnDisk(id: string): Promise<boolean> {
    try {
      await access(path.join(this._sessionsDir, id));
      return true;
    } catch {
      return false;
    }
  }

  private evictIfNeeded(): void {
    if (this.cache.size <= MAX_CACHED_AGENTS) return;

    const entries = [...this.cache.entries()]
      .filter(
        ([, e]) => !e.agent.isRunning && e.agent.sseLog.activeReaderCount === 0,
      )
      .sort((a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt);

    for (const [id] of entries) {
      if (this.cache.size <= MAX_CACHED_AGENTS) break;
      this.cache.delete(id);
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/backend && bun run test -- src/models/agent-store/agent-store.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/models/agent-store/agent-store.ts apps/backend/src/models/agent-store/agent-store.test.ts
git commit -m "feat(backend): add async lazy loading and LRU eviction to AgentStore"
```

---

### Task 8: Async propagation — chatService and router

**Files:**

- Modify: `apps/backend/src/services/chat/chat-service.ts`
- Modify: `apps/backend/src/dispatcher/chat/router.ts`
- Modify: `apps/backend/src/startup/init-services.ts`

- [ ] **Step 1: Update initServices to pass sessionsDir**

In `init-services.ts`:

```typescript
import path from 'node:path';

import {MainAgent} from '@/agent/agents/index.js';
import {getLlmConfig} from '@/services/chat/helpers.js';

export async function initServices(): Promise<void> {
  await initSettingsManager();
  initAgentStore();
  initToolRegistries();
  initSkillRegistries();
  initVscodeServer();
}

function initAgentStore(): void {
  const sessionsDir = path.join(getDataDir(), 'sessions');
  AgentStore.create(sessionsDir, async (sessionsDir, id) =>
    MainAgent.restore(getLlmConfig, sessionsDir, id),
  );
}
```

- [ ] **Step 2: Update chatService for async AgentStore**

In `chat-service.ts`, make all methods that call `AgentStore.get()` or `AgentStore.delete()` async:

```typescript
export const chatService = {
  async createSession(
    options: CreateSessionOptions = {},
  ): Promise<CreateSessionResult> {
    // ... existing validation unchanged ...

    const sessionsDir = AgentStore.getInstance().sessionsDir;
    const agent = new MainAgent(
      getLlmConfig,
      workingDirectory,
      resolvedExtraFilePathEntries,
      sessionsDir,
    );
    return {success: true, sessionId: agent.id};
  },

  async sendCompletion(
    agentId: string,
    userMessage: string,
    thinkingLevel: ThinkingLevel,
  ): Promise<boolean> {
    const agent = await AgentStore.getInstance().get(agentId);
    if (!agent) return false;
    agent.handleUserMessage(userMessage, thinkingLevel);
    return true;
  },

  async subscribe(
    agentId: string,
    options?: AgentSseLogReaderOptions,
  ): Promise<AsyncIterable<SseEvent> | undefined> {
    const agent = await AgentStore.getInstance().get(agentId);
    if (!agent) return undefined;
    return agent.subscribe(options);
  },

  async abortCompletion(agentId: string): Promise<boolean> {
    const agent = await AgentStore.getInstance().get(agentId);
    if (!agent) return false;
    agent.abort();
    return true;
  },

  async submitToolResponse(
    agentId: string,
    interactionId: string,
    result: unknown,
  ): Promise<boolean> {
    const agent = await AgentStore.getInstance().get(agentId);
    if (!agent) return false;
    return agent.submitUserResponse(interactionId, result);
  },

  async deleteSession(agentId: string): Promise<void> {
    await AgentStore.getInstance().delete(agentId);
  },
};
```

- [ ] **Step 3: Update router.ts for async chatService**

In `router.ts`, add `await` to all chatService calls. The handlers are already async, so this is mechanical:

```typescript
// POST /session/:id/completions
const found = await chatService.sendCompletion(id, message, thinkingLevel);

// GET /session/:id/events
const reader = await chatService.subscribe(id, {startIndex: from, signal});

// POST /session/:id/abort
const found = await chatService.abortCompletion(id);

// POST /session/:id/tool-response
const found = await chatService.submitToolResponse(id, interactionId, result);
```

- [ ] **Step 4: Run typecheck and lint**

Run: `cd apps/backend && bun run typecheck && bun run lint`
Expected: PASS

- [ ] **Step 5: Run all tests**

Run: `cd apps/backend && bun run test`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/startup/init-services.ts apps/backend/src/services/chat/chat-service.ts apps/backend/src/dispatcher/chat/router.ts apps/backend/src/models/agent-store/agent-store.ts
git commit -m "feat(backend): async propagation for session persistence"
```

---

### Task 9: Final integration verification

**Files:** None (verification only)

- [ ] **Step 1: Run full test suite**

Run: `cd apps/backend && bun run test`
Expected: All tests PASS

- [ ] **Step 2: Run typecheck and lint**

Run: `cd apps/backend && bun run typecheck && bun run lint`
Expected: PASS

- [ ] **Step 3: Verify lint and format**

Run: `cd apps/backend && bunx prettier --check src/`
Expected: All files formatted correctly

- [ ] **Step 4: Commit any fixes if needed**

If lint/format/typecheck reveals issues, fix and commit:

```bash
git commit -m "fix(backend): address lint/typecheck issues from persistence changes"
```
