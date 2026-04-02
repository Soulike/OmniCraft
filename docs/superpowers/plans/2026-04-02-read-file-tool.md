# read_file Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a `read_file` tool that enables the Agent's LLM to read text files within the working directory, with content caching, size limits, and binary detection.

**Architecture:** Framework layer (`agent-core`) gets two new `ToolExecutionContext` fields: `workingDirectory` and `fileCache`. `FileContentCache` is an LRU cache keyed by absolute path with mtime/size validation. The `read_file` tool lives in the `agent/tools/file/` module and uses both context fields.

**Tech Stack:** Node.js `fs/promises` for file I/O, Zod for parameter validation, Vitest for testing.

**Spec:** `docs/superpowers/specs/2026-04-02-read-file-tool-design.md`

---

## File Structure

### New files

| File                                                           | Responsibility                                    |
| -------------------------------------------------------------- | ------------------------------------------------- |
| `apps/backend/src/agent/tools/file/file-content-cache.ts`      | LRU file content cache with mtime/size validation |
| `apps/backend/src/agent/tools/file/file-content-cache.test.ts` | Tests for FileContentCache                        |
| `apps/backend/src/agent/tools/file/read-file.ts`               | `read_file` tool definition                       |
| `apps/backend/src/agent/tools/file/read-file.test.ts`          | Tests for read_file tool                          |

### Modified files

| File                                                      | Change                                                                                       |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `apps/backend/src/agent-core/agent/types.ts`              | Add `AgentSnapshotOptions`, update `AgentSnapshot`, add `workingDirectory` to `AgentOptions` |
| `apps/backend/src/agent-core/agent/agent.ts`              | Accept `workingDirectory`, create `FileContentCache`, inject into `ToolExecutionContext`     |
| `apps/backend/src/agent-core/agent/index.ts`              | Export `AgentSnapshotOptions`                                                                |
| `apps/backend/src/agent-core/tool/types.ts`               | Add `workingDirectory` and `fileCache` to `ToolExecutionContext`                             |
| `apps/backend/src/agent-core/tool/index.ts`               | Re-export `FileContentCache` type                                                            |
| `apps/backend/src/agent-core/tool/testing.ts`             | Update `createMockContext()` defaults                                                        |
| `apps/backend/src/agent/tools/file/file-tool-registry.ts` | Register `readFileTool`                                                                      |
| `apps/backend/src/agent/tools/file/index.ts`              | Export `FileContentCache`, `readFileTool`                                                    |
| `apps/backend/src/agent/agents/core-agent/core-agent.ts`  | Pass `workingDirectory` to `super()`                                                         |
| `apps/backend/src/services/chat/chat-service.ts`          | Pass `workingDirectory` when creating `CoreAgent`                                            |

---

### Task 1: Add `workingDirectory` and `fileCache` to framework types

**Files:**

- Modify: `apps/backend/src/agent-core/tool/types.ts`
- Modify: `apps/backend/src/agent-core/agent/types.ts`
- Modify: `apps/backend/src/agent-core/agent/index.ts`

- [ ] **Step 1: Add `workingDirectory` and `fileCache` to `ToolExecutionContext`**

In `apps/backend/src/agent-core/tool/types.ts`, add a forward-declared interface for `FileContentCache` and two new fields:

```typescript
import type {z} from 'zod';

import type {SkillDefinition} from '../skill/skill-definition.js';
import type {ToolSetDefinition} from '../tool-set/tool-set-definition.js';
import type {LoadToolSetToAgentFn} from '../tool-set/types.js';

/** Forward-declared to avoid circular dependency with the agent/tools layer. */
export interface FileContentCache {
  get(absolutePath: string): Promise<string | undefined>;
  set(absolutePath: string, content: string): Promise<void>;
  invalidate(absolutePath: string): void;
}

/** Execution context provided by the Agent to each Tool at call time. */
export interface ToolExecutionContext {
  /** All skills available to the current Agent, merged and deduplicated. */
  readonly availableSkills: ReadonlyMap<string, SkillDefinition>;

  /** All tool sets available to the current Agent, merged and deduplicated. */
  readonly availableToolSets: ReadonlyMap<string, ToolSetDefinition>;

  /** Tool sets currently loaded into the Agent. */
  readonly loadedToolSets: ReadonlySet<ToolSetDefinition>;

  /** Loads a tool set into the Agent, making its tools available in subsequent rounds. */
  readonly loadToolSetToAgent: LoadToolSetToAgentFn;

  /** The Agent's working directory. File tools resolve relative paths against this. */
  readonly workingDirectory: string;

  /** LRU cache for file contents, scoped to the Agent's lifetime. */
  readonly fileCache: FileContentCache;
}

/**
 * A stateless, singleton tool definition.
 *
 * - `parameters`: Zod schema used for type inference, runtime validation,
 *   and JSON Schema generation for LLM APIs.
 * - `execute`: Receives validated args from the LLM and execution context
 *   from the Agent. Returns a text result.
 */
export interface ToolDefinition<T extends z.ZodType = z.ZodType> {
  readonly name: string;
  /** Human-readable name for UI display. */
  readonly displayName: string;
  readonly description: string;
  readonly parameters: T;
  execute(
    args: z.infer<T>,
    context: ToolExecutionContext,
  ): Promise<string> | string;
}
```

- [ ] **Step 2: Add `AgentSnapshotOptions`, `workingDirectory`, and `fileCache` to agent types**

In `apps/backend/src/agent-core/agent/types.ts`, add `AgentSnapshotOptions`, update `AgentSnapshot`, and add `workingDirectory` + `fileCache` to `AgentOptions`:

```typescript
import type {LlmSessionSnapshot} from '../llm-session/index.js';
import type {LlmSessionTextDeltaEvent} from '../llm-session/index.js';
import type {SkillRegistry} from '../skill/index.js';
import type {FileContentCache, ToolRegistry} from '../tool/index.js';
import type {ToolSetRegistry} from '../tool-set/index.js';

// ---------------------------------------------------------------------------
// Agent Event Types
// ---------------------------------------------------------------------------

/** The agent has started executing a tool call. */
export interface AgentToolExecuteStartEvent {
  type: 'tool-execute-start';
  callId: string;
  toolName: string;
  displayName: string;
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
// Agent Snapshot (for persistence)
// ---------------------------------------------------------------------------

/** Serializable agent configuration persisted in snapshots. */
export interface AgentSnapshotOptions {
  workingDirectory: string;
}

/** Serializable snapshot of an Agent, used for persistence. */
export interface AgentSnapshot {
  id: string;
  llmSession: LlmSessionSnapshot;
  options: AgentSnapshotOptions;
}

// ---------------------------------------------------------------------------
// Agent Options
// ---------------------------------------------------------------------------

export interface AgentOptions {
  readonly toolRegistries: ToolRegistry[];
  readonly toolSetRegistries: ToolSetRegistry[];
  readonly skillRegistries: SkillRegistry[];
  readonly baseSystemPrompt: string;
  readonly getMaxToolRounds: () => Promise<number> | number;
  readonly workingDirectory: string;
  readonly fileCache: FileContentCache;
}
```

- [ ] **Step 3: Export `AgentSnapshotOptions` and `FileContentCache` from barrel files**

In `apps/backend/src/agent-core/agent/index.ts`:

```typescript
export {Agent} from './agent.js';
export type {
  AgentDoneEvent,
  AgentEvent,
  AgentEventStream,
  AgentOptions,
  AgentSnapshot,
  AgentSnapshotOptions,
  AgentToolExecuteEndEvent,
  AgentToolExecuteStartEvent,
} from './types.js';
```

In `apps/backend/src/agent-core/tool/index.ts`:

```typescript
export {loadSkillTool} from './load-skill.js';
export {ToolRegistry} from './tool-registry.js';
export type {
  FileContentCache,
  ToolDefinition,
  ToolExecutionContext,
} from './types.js';
```

- [ ] **Step 4: Update `createMockContext()` test helper**

In `apps/backend/src/agent-core/tool/testing.ts`:

```typescript
/**
 * Shared test helpers for the tool module.
 * Only imported by test files — never by production code.
 */
import os from 'node:os';
import {z} from 'zod';

import type {ToolSetDefinition} from '../tool-set/tool-set-definition.js';
import type {
  FileContentCache,
  ToolDefinition,
  ToolExecutionContext,
} from './types.js';

/** Creates a minimal mock ToolDefinition. */
export function createMockTool(name: string): ToolDefinition {
  return {
    name,
    displayName: `Mock: ${name}`,
    description: `Mock tool: ${name}`,
    parameters: z.object({}),
    execute: () => Promise.resolve('ok'),
  };
}

/** Creates a no-op FileContentCache for testing. */
function createMockFileCache(): FileContentCache {
  return {
    get: () => Promise.resolve(undefined),
    set: () => Promise.resolve(),
    invalidate: () => {
      // noop
    },
  };
}

/** Creates a ToolExecutionContext with sensible defaults, overridable per field. */
export function createMockContext(
  overrides?: Partial<ToolExecutionContext>,
): ToolExecutionContext {
  return {
    availableSkills: new Map(),
    availableToolSets: new Map<string, ToolSetDefinition>(),
    loadedToolSets: new Set(),
    loadToolSetToAgent: () => {
      // noop
    },
    workingDirectory: os.tmpdir(),
    fileCache: createMockFileCache(),
    ...overrides,
  };
}
```

- [ ] **Step 5: Verify existing tests still pass**

Run: `cd apps/backend && bun run test`

Expected: All existing tests pass (the mock context now includes new fields with defaults).

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/agent-core/tool/types.ts apps/backend/src/agent-core/tool/index.ts apps/backend/src/agent-core/tool/testing.ts apps/backend/src/agent-core/agent/types.ts apps/backend/src/agent-core/agent/index.ts
git commit -m "feat(backend): add workingDirectory and fileCache to ToolExecutionContext"
```

---

### Task 2: Implement `FileContentCache`

**Files:**

- Create: `apps/backend/src/agent/tools/file/file-content-cache.ts`
- Test: `apps/backend/src/agent/tools/file/file-content-cache.test.ts`

- [ ] **Step 1: Write tests for `FileContentCache`**

Create `apps/backend/src/agent/tools/file/file-content-cache.test.ts`:

```typescript
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {FileContentCache} from './file-content-cache.js';

describe('FileContentCache', () => {
  let tmpDir: string;
  let cache: FileContentCache;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fcc-test-'));
    cache = new FileContentCache();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  async function writeFile(name: string, content: string): Promise<string> {
    const filePath = path.join(tmpDir, name);
    await fs.writeFile(filePath, content);
    return filePath;
  }

  describe('get', () => {
    it('returns undefined for a path that was never cached', async () => {
      const filePath = path.join(tmpDir, 'nonexistent.txt');
      expect(await cache.get(filePath)).toBeUndefined();
    });

    it('returns cached content when file has not changed', async () => {
      const filePath = await writeFile('a.txt', 'hello');
      await cache.set(filePath, 'hello');
      expect(await cache.get(filePath)).toBe('hello');
    });

    it('returns undefined and invalidates when file mtime changes', async () => {
      const filePath = await writeFile('a.txt', 'v1');
      await cache.set(filePath, 'v1');

      // Overwrite to change mtime (add small delay to ensure mtime differs)
      await new Promise((r) => setTimeout(r, 50));
      await fs.writeFile(filePath, 'v2');

      expect(await cache.get(filePath)).toBeUndefined();
    });

    it('returns undefined and invalidates when file size changes', async () => {
      const filePath = await writeFile('a.txt', 'short');
      await cache.set(filePath, 'short');

      // Truncate changes size but may keep same mtime on fast writes
      await new Promise((r) => setTimeout(r, 50));
      await fs.writeFile(filePath, 'a much longer content string');

      expect(await cache.get(filePath)).toBeUndefined();
    });
  });

  describe('set', () => {
    it('stores content that can be retrieved', async () => {
      const filePath = await writeFile('a.txt', 'content');
      await cache.set(filePath, 'content');
      expect(await cache.get(filePath)).toBe('content');
    });

    it('does not cache content exceeding single file limit', async () => {
      const bigContent = 'x'.repeat(1_100_000); // > 1MB
      const filePath = await writeFile('big.txt', bigContent);
      await cache.set(filePath, bigContent);
      expect(await cache.get(filePath)).toBeUndefined();
    });

    it('evicts LRU entries when total size exceeds limit', async () => {
      // Use a small cache for testing
      const smallCache = new FileContentCache({totalSizeLimit: 100});
      const f1 = await writeFile('f1.txt', 'a'.repeat(60));
      const f2 = await writeFile('f2.txt', 'b'.repeat(60));

      await smallCache.set(f1, 'a'.repeat(60));
      await smallCache.set(f2, 'b'.repeat(60));

      // f1 should have been evicted to make room for f2
      expect(await smallCache.get(f1)).toBeUndefined();
      expect(await smallCache.get(f2)).toBe('b'.repeat(60));
    });
  });

  describe('invalidate', () => {
    it('removes a cached entry', async () => {
      const filePath = await writeFile('a.txt', 'content');
      await cache.set(filePath, 'content');
      cache.invalidate(filePath);
      expect(await cache.get(filePath)).toBeUndefined();
    });

    it('is a no-op for unknown paths', () => {
      expect(() => cache.invalidate('/no/such/path')).not.toThrow();
    });
  });

  describe('LRU ordering', () => {
    it('get() refreshes entry, preventing eviction', async () => {
      const smallCache = new FileContentCache({totalSizeLimit: 150});
      const f1 = await writeFile('f1.txt', 'a'.repeat(60));
      const f2 = await writeFile('f2.txt', 'b'.repeat(60));
      const f3 = await writeFile('f3.txt', 'c'.repeat(60));

      await smallCache.set(f1, 'a'.repeat(60));
      await smallCache.set(f2, 'b'.repeat(60));

      // Access f1 to make it most recently used
      await smallCache.get(f1);

      // f3 should evict f2 (least recently used), not f1
      await smallCache.set(f3, 'c'.repeat(60));

      expect(await smallCache.get(f1)).toBe('a'.repeat(60));
      expect(await smallCache.get(f2)).toBeUndefined();
      expect(await smallCache.get(f3)).toBe('c'.repeat(60));
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun run test -- src/agent/tools/file/file-content-cache.test.ts`

Expected: FAIL — `FileContentCache` is not exported from `./file-content-cache.js`.

- [ ] **Step 3: Implement `FileContentCache`**

Create `apps/backend/src/agent/tools/file/file-content-cache.ts`:

```typescript
import fs from 'node:fs/promises';

const DEFAULT_SINGLE_FILE_LIMIT = 1_048_576; // 1MB
const DEFAULT_TOTAL_SIZE_LIMIT = 10_485_760; // 10MB

interface CacheEntry {
  content: string;
  mtimeMs: number;
  size: number;
  byteLength: number;
}

interface FileContentCacheOptions {
  singleFileLimit?: number;
  totalSizeLimit?: number;
}

/** LRU cache for file contents with mtime/size validation. */
export class FileContentCache {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly singleFileLimit: number;
  private readonly totalSizeLimit: number;
  private currentTotalSize = 0;

  constructor(options?: FileContentCacheOptions) {
    this.singleFileLimit =
      options?.singleFileLimit ?? DEFAULT_SINGLE_FILE_LIMIT;
    this.totalSizeLimit = options?.totalSizeLimit ?? DEFAULT_TOTAL_SIZE_LIMIT;
  }

  /** Returns cached content if valid, or undefined if missing/stale. */
  async get(absolutePath: string): Promise<string | undefined> {
    const entry = this.entries.get(absolutePath);
    if (!entry) return undefined;

    let stat: Awaited<ReturnType<typeof fs.stat>>;
    try {
      stat = await fs.stat(absolutePath);
    } catch {
      this.invalidate(absolutePath);
      return undefined;
    }

    if (stat.mtimeMs !== entry.mtimeMs || stat.size !== entry.size) {
      this.invalidate(absolutePath);
      return undefined;
    }

    // Move to end (most recently used)
    this.entries.delete(absolutePath);
    this.entries.set(absolutePath, entry);

    return entry.content;
  }

  /** Caches file content with current mtime/size. Skips files exceeding single file limit. */
  async set(absolutePath: string, content: string): Promise<void> {
    const byteLength = Buffer.byteLength(content);
    if (byteLength > this.singleFileLimit) return;

    // Remove existing entry if present (will be re-inserted at end)
    this.invalidate(absolutePath);

    // Evict LRU entries until there is room
    this.evictUntilFits(byteLength);

    let stat: Awaited<ReturnType<typeof fs.stat>>;
    try {
      stat = await fs.stat(absolutePath);
    } catch {
      return;
    }

    this.entries.set(absolutePath, {
      content,
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      byteLength,
    });
    this.currentTotalSize += byteLength;
  }

  /** Removes a cached entry. */
  invalidate(absolutePath: string): void {
    const entry = this.entries.get(absolutePath);
    if (!entry) return;
    this.currentTotalSize -= entry.byteLength;
    this.entries.delete(absolutePath);
  }

  /** Evicts least recently used entries until `needed` bytes fit. */
  private evictUntilFits(needed: number): void {
    for (const [key, entry] of this.entries) {
      if (this.currentTotalSize + needed <= this.totalSizeLimit) break;
      this.currentTotalSize -= entry.byteLength;
      this.entries.delete(key);
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/backend && bun run test -- src/agent/tools/file/file-content-cache.test.ts`

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/agent/tools/file/file-content-cache.ts apps/backend/src/agent/tools/file/file-content-cache.test.ts
git commit -m "feat(backend): implement FileContentCache with LRU eviction"
```

---

### Task 3: Wire `workingDirectory` and `FileContentCache` into Agent

**Files:**

- Modify: `apps/backend/src/agent-core/agent/agent.ts`
- Modify: `apps/backend/src/agent/agents/core-agent/core-agent.ts`
- Modify: `apps/backend/src/agent/tools/file/index.ts`
- Modify: `apps/backend/src/agent/tools/index.ts`
- Modify: `apps/backend/src/services/chat/chat-service.ts`

- [ ] **Step 1: Update `Agent` base class**

In `apps/backend/src/agent-core/agent/agent.ts`, add `workingDirectory` and `fileCache` fields, update constructor, `toSnapshot()`, and `executeTool()`:

```typescript
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
import type {
  FileContentCache,
  ToolDefinition,
  ToolExecutionContext,
} from '../tool/index.js';
import {loadSkillTool} from '../tool/index.js';
import type {ToolSetDefinition} from '../tool-set/index.js';
import {loadToolSetTool} from '../tool-set/index.js';
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
  private readonly fileCache: FileContentCache;

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
    this.fileCache = options.fileCache;

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

  // ... handleUserMessage, consumeStream, getAvailableTools, getAvailableSkills,
  //     getAvailableToolSets, buildSystemPrompt — ALL UNCHANGED ...

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
```

Note: Only the constructor, field declarations, `toSnapshot()`, and `executeTool()` change. All other methods remain unchanged.

- [ ] **Step 2: Update `CoreAgent` to pass `workingDirectory` and real `FileContentCache`**

Update `apps/backend/src/agent/tools/file/index.ts` to export `FileContentCache`:

```typescript
export {FileContentCache} from './file-content-cache.js';
export {FileToolRegistry} from './file-tool-registry.js';
```

Update `apps/backend/src/agent/tools/index.ts` to re-export:

```typescript
export {CoreToolRegistry} from './core/core-tool-registry.js';
export {FileContentCache} from './file/file-content-cache.js';
export {FileToolRegistry} from './file/file-tool-registry.js';
```

Update `apps/backend/src/agent/agents/core-agent/core-agent.ts`:

```typescript
import {CoreSkillRegistry} from '@/agent/skills/index.js';
import {CoreToolSetRegistry} from '@/agent/tool-sets/index.js';
import {
  CoreToolRegistry,
  FileContentCache,
  FileToolRegistry,
} from '@/agent/tools/index.js';
import {Agent} from '@/agent-core/agent/index.js';
import type {LlmConfig} from '@/agent-core/llm-api/index.js';
import {settingsService} from '@/services/settings/index.js';

/**
 * Default agent with core tools and skills.
 * Used as the standard agent type for chat sessions.
 */
export class CoreAgent extends Agent {
  constructor(getConfig: () => Promise<LlmConfig>, workingDirectory: string) {
    super(getConfig, {
      toolRegistries: [
        CoreToolRegistry.getInstance(),
        FileToolRegistry.getInstance(),
      ],
      toolSetRegistries: [CoreToolSetRegistry.getInstance()],
      skillRegistries: [CoreSkillRegistry.getInstance()],
      baseSystemPrompt: 'You are a helpful assistant.',
      getMaxToolRounds: async () => {
        const settings = await settingsService.getAll();
        return settings.agent.maxToolRounds;
      },
      workingDirectory,
      fileCache: new FileContentCache(),
    });
  }
}
```

- [ ] **Step 3: Update `chatService` to pass `workingDirectory`**

In `apps/backend/src/services/chat/chat-service.ts`, use `process.cwd()` as the default working directory:

```typescript
const agent = new CoreAgent(getLlmConfig, process.cwd());
```

This is the only line that changes in the file.

- [ ] **Step 4: Run typecheck and tests**

Run: `cd apps/backend && bun run typecheck && bun run test`

Expected: Type check passes, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/agent-core/agent/agent.ts apps/backend/src/agent/agents/core-agent/core-agent.ts apps/backend/src/agent/tools/file/index.ts apps/backend/src/agent/tools/index.ts apps/backend/src/services/chat/chat-service.ts
git commit -m "feat(backend): wire workingDirectory and FileContentCache into Agent"
```

---

### Task 4: Implement `read_file` tool

**Files:**

- Create: `apps/backend/src/agent/tools/file/read-file.ts`
- Test: `apps/backend/src/agent/tools/file/read-file.test.ts`

- [ ] **Step 1: Write tests for `read_file`**

Create `apps/backend/src/agent/tools/file/read-file.test.ts`:

```typescript
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {createMockContext} from '@/agent-core/tool/testing.js';
import type {ToolExecutionContext} from '@/agent-core/tool/types.js';

import {FileContentCache} from './file-content-cache.js';
import {readFileTool} from './read-file.js';

describe('readFileTool', () => {
  let tmpDir: string;
  let context: ToolExecutionContext;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rft-test-'));
    context = createMockContext({
      workingDirectory: tmpDir,
      fileCache: new FileContentCache(),
    });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  async function writeFile(name: string, content: string): Promise<string> {
    const filePath = path.join(tmpDir, name);
    await fs.mkdir(path.dirname(filePath), {recursive: true});
    await fs.writeFile(filePath, content);
    return filePath;
  }

  it('has the correct name', () => {
    expect(readFileTool.name).toBe('read_file');
  });

  describe('success cases', () => {
    it('reads a full file with line numbers and header', async () => {
      await writeFile('hello.txt', 'line1\nline2\nline3');
      const result = await readFileTool.execute(
        {filePath: 'hello.txt'},
        context,
      );

      expect(result).toContain('File: hello.txt (3 lines)');
      expect(result).toContain('1\tline1');
      expect(result).toContain('2\tline2');
      expect(result).toContain('3\tline3');
    });

    it('reads partial file with startLine', async () => {
      await writeFile('lines.txt', 'a\nb\nc\nd\ne');
      const result = await readFileTool.execute(
        {filePath: 'lines.txt', startLine: 3},
        context,
      );

      expect(result).toContain('(5 lines, showing lines 3-5)');
      expect(result).toContain('3\tc');
      expect(result).toContain('5\te');
      expect(result).not.toContain('1\ta');
    });

    it('reads partial file with startLine and lineCount', async () => {
      await writeFile('lines.txt', 'a\nb\nc\nd\ne');
      const result = await readFileTool.execute(
        {filePath: 'lines.txt', startLine: 2, lineCount: 2},
        context,
      );

      expect(result).toContain('(5 lines, showing lines 2-3)');
      expect(result).toContain('2\tb');
      expect(result).toContain('3\tc');
      expect(result).not.toContain('4\td');
    });

    it('resolves relative paths against workingDirectory', async () => {
      await writeFile('sub/file.txt', 'content');
      const result = await readFileTool.execute(
        {filePath: 'sub/file.txt'},
        context,
      );

      expect(result).toContain('File: sub/file.txt');
      expect(result).toContain('content');
    });

    it('accepts absolute paths within workingDirectory', async () => {
      const absPath = await writeFile('abs.txt', 'data');
      const result = await readFileTool.execute({filePath: absPath}, context);

      expect(result).toContain('data');
    });

    it('right-aligns line numbers', async () => {
      const lines = Array.from({length: 100}, (_, i) => `line${i + 1}`).join(
        '\n',
      );
      await writeFile('hundred.txt', lines);
      const result = await readFileTool.execute(
        {filePath: 'hundred.txt', startLine: 1, lineCount: 2},
        context,
      );

      // Line 1 should be padded to match width of "100"
      expect(result).toContain('  1\tline1');
      expect(result).toContain('  2\tline2');
    });
  });

  describe('error cases', () => {
    it('rejects paths outside workingDirectory', async () => {
      const result = await readFileTool.execute(
        {filePath: '/etc/passwd'},
        context,
      );

      expect(result).toContain('Error: Access denied');
    });

    it('rejects path traversal attacks', async () => {
      const result = await readFileTool.execute(
        {filePath: '../../../etc/passwd'},
        context,
      );

      expect(result).toContain('Error: Access denied');
    });

    it('returns error for nonexistent file', async () => {
      const result = await readFileTool.execute(
        {filePath: 'nope.txt'},
        context,
      );

      expect(result).toContain('Error: File not found');
    });

    it('returns error for directories', async () => {
      await fs.mkdir(path.join(tmpDir, 'adir'));
      const result = await readFileTool.execute({filePath: 'adir'}, context);

      expect(result).toContain('Error: Not a file');
    });

    it('returns error for binary files', async () => {
      const binaryContent = Buffer.alloc(100);
      binaryContent[50] = 0x00; // null byte
      binaryContent.fill(0x41, 0, 50); // 'A' before null
      await fs.writeFile(path.join(tmpDir, 'binary.bin'), binaryContent);

      const result = await readFileTool.execute(
        {filePath: 'binary.bin'},
        context,
      );

      expect(result).toContain('Error: Binary file detected');
    });

    it('returns error when result exceeds 32KB', async () => {
      // Create a file with many long lines that exceed 32KB
      const longLine = 'x'.repeat(500);
      const lines = Array.from({length: 200}, () => longLine).join('\n');
      await writeFile('huge.txt', lines);

      const result = await readFileTool.execute(
        {filePath: 'huge.txt'},
        context,
      );

      expect(result).toContain('Error: Read result exceeds 32KB limit');
      expect(result).toContain('200 lines');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/backend && bun run test -- src/agent/tools/file/read-file.test.ts`

Expected: FAIL — `readFileTool` is not exported from `./read-file.js`.

- [ ] **Step 3: Implement `readFileTool`**

Create `apps/backend/src/agent/tools/file/read-file.ts`:

```typescript
import fs from 'node:fs/promises';
import path from 'node:path';
import {z} from 'zod';

import type {
  ToolDefinition,
  ToolExecutionContext,
} from '@/agent-core/tool/index.js';

const MAX_RETURN_SIZE = 32_768; // 32KB
const BINARY_DETECTION_SIZE = 8_192; // 8KB

const parameters = z.object({
  filePath: z
    .string()
    .describe('File path, absolute or relative to working directory'),
  startLine: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Start line number (1-based), defaults to 1'),
  lineCount: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Number of lines to read, defaults to end of file'),
});

type ReadFileArgs = z.infer<typeof parameters>;

/** Built-in tool that reads text file contents with line numbers. */
export const readFileTool: ToolDefinition<typeof parameters> = {
  name: 'read_file',
  displayName: 'Read File',
  description:
    'Reads a text file and returns its contents with line numbers. ' +
    'Supports partial reads via startLine and lineCount parameters. ' +
    'Only text files within the working directory are allowed.',
  parameters,
  async execute(
    args: ReadFileArgs,
    context: ToolExecutionContext,
  ): Promise<string> {
    const {workingDirectory, fileCache} = context;

    // 1. Resolve path
    const absolutePath = path.resolve(workingDirectory, args.filePath);

    // 2. Security check
    if (
      !absolutePath.startsWith(workingDirectory + path.sep) &&
      absolutePath !== workingDirectory
    ) {
      return 'Error: Access denied: path is outside the working directory';
    }

    // 3. Stat
    let stat: Awaited<ReturnType<typeof fs.stat>>;
    try {
      stat = await fs.stat(absolutePath);
    } catch {
      return `Error: File not found: ${args.filePath}`;
    }

    if (!stat.isFile()) {
      return `Error: Not a file: ${args.filePath}`;
    }

    // 4. Binary check
    try {
      const handle = await fs.open(absolutePath, 'r');
      try {
        const buf = Buffer.alloc(Math.min(BINARY_DETECTION_SIZE, stat.size));
        await handle.read(buf, 0, buf.length, 0);
        if (buf.includes(0x00)) {
          return `Error: Binary file detected: ${args.filePath}. Only text files are supported.`;
        }
      } finally {
        await handle.close();
      }
    } catch {
      return `Error: Binary file detected: ${args.filePath}. Only text files are supported.`;
    }

    // 5. Get content (cache or disk)
    let fullContent: string | undefined = await fileCache.get(absolutePath);
    if (fullContent === undefined) {
      try {
        fullContent = await fs.readFile(absolutePath, 'utf-8');
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return `Error: ${message}`;
      }
      await fileCache.set(absolutePath, fullContent);
    }

    // 6. Split into lines and extract range
    const allLines = fullContent.split('\n');
    // Remove trailing empty line from final newline
    if (allLines.length > 0 && allLines[allLines.length - 1] === '') {
      allLines.pop();
    }
    const totalLines = allLines.length;

    const startLine = args.startLine ?? 1;
    const endLine = args.lineCount
      ? Math.min(startLine + args.lineCount - 1, totalLines)
      : totalLines;

    const selectedLines = allLines.slice(startLine - 1, endLine);

    // 7. Format with line numbers
    const lineNumberWidth = String(totalLines).length;
    const formatted = selectedLines
      .map(
        (line, i) =>
          `${String(startLine + i).padStart(lineNumberWidth)}\t${line}`,
      )
      .join('\n');

    // 8. Check size limit
    if (Buffer.byteLength(formatted) > MAX_RETURN_SIZE) {
      return (
        `Error: Read result exceeds 32KB limit. ` +
        `File: ${args.filePath} (${totalLines} lines). ` +
        `Use startLine and lineCount to read a portion.`
      );
    }

    // 9. Build header and return
    const isPartial = startLine !== 1 || endLine !== totalLines;
    const rangeInfo = isPartial
      ? ` (${totalLines} lines, showing lines ${startLine}-${endLine})`
      : ` (${totalLines} lines)`;
    const header = `File: ${args.filePath}${rangeInfo}`;

    return `${header}\n${formatted}`;
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/backend && bun run test -- src/agent/tools/file/read-file.test.ts`

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/agent/tools/file/read-file.ts apps/backend/src/agent/tools/file/read-file.test.ts
git commit -m "feat(backend): implement read_file tool"
```

---

### Task 5: Register tool and update exports

**Files:**

- Modify: `apps/backend/src/agent/tools/file/file-tool-registry.ts`
- Modify: `apps/backend/src/agent/tools/file/index.ts`

- [ ] **Step 1: Register `readFileTool` in `FileToolRegistry`**

Update `apps/backend/src/agent/tools/file/file-tool-registry.ts`:

```typescript
import {ToolRegistry} from '@/agent-core/tool/index.js';

import {readFileTool} from './read-file.js';

/** Registry for file-operation tools. */
export class FileToolRegistry extends ToolRegistry {
  /** Creates the singleton and registers all file tools. */
  static override create(): FileToolRegistry {
    const instance = super.create() as FileToolRegistry;
    instance.register(readFileTool);
    return instance;
  }
}
```

- [ ] **Step 2: Update barrel export to include `readFileTool`**

Update `apps/backend/src/agent/tools/file/index.ts`:

```typescript
export {FileContentCache} from './file-content-cache.js';
export {FileToolRegistry} from './file-tool-registry.js';
export {readFileTool} from './read-file.js';
```

- [ ] **Step 3: Run full typecheck and test suite**

Run: `cd apps/backend && bun run typecheck && bun run test`

Expected: All type checks pass, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/agent/tools/file/file-tool-registry.ts apps/backend/src/agent/tools/file/index.ts
git commit -m "feat(backend): register read_file tool in FileToolRegistry"
```
