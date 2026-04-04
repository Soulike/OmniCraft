# File Stat Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `FileStatTracker` to prevent blind or stale file modifications by tracking file stats after reads and validating them before writes.

**Architecture:** New `FileStatTracker` class with `set`/`canModify`/`delete` API, added to `ToolExecutionContext`. `read_file` calls `set` after read; `write_file` and `edit_file` call `canModify` before write and `set` after write.

**Tech Stack:** TypeScript, Node.js fs, Vitest

**Spec:** `docs/superpowers/specs/2026-04-04-file-stat-tracker-design.md`

---

### Task 1: Implement FileStatTracker with tests

**Files:**

- Create: `apps/backend/src/agent-core/agent/file-stat-tracker.ts`
- Create: `apps/backend/src/agent-core/agent/file-stat-tracker.test.ts`
- Modify: `apps/backend/src/agent-core/agent/index.ts`

- [ ] **Step 1: Write the test file**

Create `apps/backend/src/agent-core/agent/file-stat-tracker.test.ts`:

```typescript
import {describe, expect, it} from 'vitest';

import {FileStatCheckResult, FileStatTracker} from './file-stat-tracker.js';

describe('FileStatTracker', () => {
  it('returns NOT_READ for untracked files', () => {
    const tracker = new FileStatTracker();

    const result = tracker.canModify('/a/b.ts', 100, 1000);

    expect(result).toBe(FileStatCheckResult.NOT_READ);
  });

  it('returns OK after set with matching stat', () => {
    const tracker = new FileStatTracker();
    tracker.set('/a/b.ts', 100, 1000);

    const result = tracker.canModify('/a/b.ts', 100, 1000);

    expect(result).toBe(FileStatCheckResult.OK);
  });

  it('returns MODIFIED_SINCE_LAST_READ when size differs', () => {
    const tracker = new FileStatTracker();
    tracker.set('/a/b.ts', 100, 1000);

    const result = tracker.canModify('/a/b.ts', 200, 1000);

    expect(result).toBe(FileStatCheckResult.MODIFIED_SINCE_LAST_READ);
  });

  it('returns MODIFIED_SINCE_LAST_READ when mtimeMs differs', () => {
    const tracker = new FileStatTracker();
    tracker.set('/a/b.ts', 100, 1000);

    const result = tracker.canModify('/a/b.ts', 100, 2000);

    expect(result).toBe(FileStatCheckResult.MODIFIED_SINCE_LAST_READ);
  });

  it('clears record on NOT_READ', () => {
    const tracker = new FileStatTracker();

    tracker.canModify('/a/b.ts', 100, 1000);
    // Set after canModify should work normally
    tracker.set('/a/b.ts', 100, 1000);
    expect(tracker.canModify('/a/b.ts', 100, 1000)).toBe(
      FileStatCheckResult.OK,
    );
  });

  it('clears record on MODIFIED_SINCE_LAST_READ', () => {
    const tracker = new FileStatTracker();
    tracker.set('/a/b.ts', 100, 1000);

    // Trigger MODIFIED
    tracker.canModify('/a/b.ts', 200, 1000);

    // Now it should be NOT_READ since record was cleared
    expect(tracker.canModify('/a/b.ts', 200, 1000)).toBe(
      FileStatCheckResult.NOT_READ,
    );
  });

  it('updates record with set', () => {
    const tracker = new FileStatTracker();
    tracker.set('/a/b.ts', 100, 1000);
    tracker.set('/a/b.ts', 200, 2000);

    expect(tracker.canModify('/a/b.ts', 200, 2000)).toBe(
      FileStatCheckResult.OK,
    );
    expect(tracker.canModify('/a/b.ts', 100, 1000)).toBe(
      FileStatCheckResult.MODIFIED_SINCE_LAST_READ,
    );
  });

  it('delete removes the record', () => {
    const tracker = new FileStatTracker();
    tracker.set('/a/b.ts', 100, 1000);
    tracker.delete('/a/b.ts');

    expect(tracker.canModify('/a/b.ts', 100, 1000)).toBe(
      FileStatCheckResult.NOT_READ,
    );
  });

  it('delete on untracked file does not throw', () => {
    const tracker = new FileStatTracker();

    expect(() => tracker.delete('/a/b.ts')).not.toThrow();
  });

  it('tracks multiple files independently', () => {
    const tracker = new FileStatTracker();
    tracker.set('/a.ts', 100, 1000);
    tracker.set('/b.ts', 200, 2000);

    expect(tracker.canModify('/a.ts', 100, 1000)).toBe(FileStatCheckResult.OK);
    expect(tracker.canModify('/b.ts', 200, 2000)).toBe(FileStatCheckResult.OK);
    expect(tracker.canModify('/c.ts', 300, 3000)).toBe(
      FileStatCheckResult.NOT_READ,
    );
  });
});
```

- [ ] **Step 2: Write the implementation**

Create `apps/backend/src/agent-core/agent/file-stat-tracker.ts`:

```typescript
export enum FileStatCheckResult {
  OK = 'ok',
  NOT_READ = 'not_read',
  MODIFIED_SINCE_LAST_READ = 'modified_since_last_read',
}

interface FileStat {
  readonly size: number;
  readonly mtimeMs: number;
}

/** Tracks known file stats to prevent blind or stale modifications. */
export class FileStatTracker {
  private readonly entries = new Map<string, FileStat>();

  /** Record or update the known stat for a file. */
  set(absolutePath: string, size: number, mtimeMs: number): void {
    this.entries.set(absolutePath, {size, mtimeMs});
  }

  /**
   * Check if the file can be safely modified.
   * Clears the record on NOT_READ and MODIFIED_SINCE_LAST_READ.
   */
  canModify(
    absolutePath: string,
    currentSize: number,
    currentMtimeMs: number,
  ): FileStatCheckResult {
    const entry = this.entries.get(absolutePath);

    if (!entry) {
      return FileStatCheckResult.NOT_READ;
    }

    if (entry.size !== currentSize || entry.mtimeMs !== currentMtimeMs) {
      this.entries.delete(absolutePath);
      return FileStatCheckResult.MODIFIED_SINCE_LAST_READ;
    }

    return FileStatCheckResult.OK;
  }

  /** Remove the record for a file. */
  delete(absolutePath: string): void {
    this.entries.delete(absolutePath);
  }
}
```

- [ ] **Step 3: Export from index.ts**

Add to `apps/backend/src/agent-core/agent/index.ts`:

```typescript
export {Agent} from './agent.js';
export {FileContentCache} from './file-content-cache.js';
export {FileStatCheckResult, FileStatTracker} from './file-stat-tracker.js';
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

- [ ] **Step 4: Run tests**

```bash
cd apps/backend && bun run test -- src/agent-core/agent/file-stat-tracker.test.ts
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/agent-core/agent/file-stat-tracker.ts apps/backend/src/agent-core/agent/file-stat-tracker.test.ts apps/backend/src/agent-core/agent/index.ts
git commit -m "feat(backend): add FileStatTracker to prevent blind file modifications"
```

---

### Task 2: Wire FileStatTracker into ToolExecutionContext

**Files:**

- Modify: `apps/backend/src/agent-core/tool/types.ts`
- Modify: `apps/backend/src/agent-core/tool/testing.ts`
- Modify: `apps/backend/src/agent-core/agent/agent.ts`

- [ ] **Step 1: Add to ToolExecutionContext**

In `apps/backend/src/agent-core/tool/types.ts`, add the import and field:

```typescript
import type {z} from 'zod';

import type {FileContentCache} from '../agent/file-content-cache.js';
import type {FileStatTracker} from '../agent/file-stat-tracker.js';
import type {SkillDefinition} from '../skill/skill-definition.js';

/** A directory the agent is allowed to access beyond its working directory. */
export interface AllowedPath {
  /** Absolute path of the allowed directory. */
  readonly path: string;
  /** 'read' = read-only, 'read-write' = read and write. */
  readonly mode: 'read' | 'read-write';
}

/** Execution context provided by the Agent to each Tool at call time. */
export interface ToolExecutionContext {
  /** All skills available to the current Agent, merged and deduplicated. */
  readonly availableSkills: ReadonlyMap<string, SkillDefinition>;

  /** The Agent's working directory. File tools resolve relative paths against this. */
  readonly workingDirectory: string;

  /** LRU cache for file contents, scoped to the Agent's lifetime. */
  readonly fileCache: FileContentCache;

  /** Tracks file stats to prevent blind or stale modifications. */
  readonly fileStatTracker: FileStatTracker;

  /**
   * Additional paths the agent is allowed to access beyond workingDirectory.
   * workingDirectory is always read-write and should NOT be listed here.
   */
  readonly extraAllowedPaths: readonly AllowedPath[];
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

- [ ] **Step 2: Update createMockContext in testing.ts**

In `apps/backend/src/agent-core/tool/testing.ts`:

```typescript
/**
 * Shared test helpers for the tool module.
 * Only imported by test files — never by production code.
 */
import os from 'node:os';

import {z} from 'zod';

import {FileContentCache} from '../agent/file-content-cache.js';
import {FileStatTracker} from '../agent/file-stat-tracker.js';
import type {ToolDefinition, ToolExecutionContext} from './types.js';

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

/** Creates a ToolExecutionContext with sensible defaults, overridable per field. */
export function createMockContext(
  overrides?: Partial<ToolExecutionContext>,
): ToolExecutionContext {
  return {
    availableSkills: new Map(),
    workingDirectory: os.tmpdir(),
    fileCache: new FileContentCache(),
    fileStatTracker: new FileStatTracker(),
    extraAllowedPaths: [],
    ...overrides,
  };
}
```

- [ ] **Step 3: Add FileStatTracker to Agent**

In `apps/backend/src/agent-core/agent/agent.ts`, add the import and field:

Add import at line 19 (after `FileContentCache` import):

```typescript
import {FileStatTracker} from './file-stat-tracker.js';
```

Add field after `fileCache` (around line 57):

```typescript
  /** Tracks file stats for modification safety checks. */
  private readonly fileStatTracker = new FileStatTracker();
```

Update the context object (around line 307):

```typescript
const context: ToolExecutionContext = {
  availableSkills: this.getAvailableSkills(),
  workingDirectory: this.workingDirectory,
  fileCache: this.fileCache,
  fileStatTracker: this.fileStatTracker,
  extraAllowedPaths: this.extraAllowedPaths,
};
```

- [ ] **Step 4: Run all tests and typecheck**

```bash
cd apps/backend && bun run test && bun run typecheck
```

Expected: all tests PASS, no type errors

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/agent-core/tool/types.ts apps/backend/src/agent-core/tool/testing.ts apps/backend/src/agent-core/agent/agent.ts
git commit -m "feat(backend): wire FileStatTracker into ToolExecutionContext"
```

---

### Task 3: Integrate into read_file

**Files:**

- Modify: `apps/backend/src/agent/tools/file/read-file.ts`
- Modify: `apps/backend/src/agent/tools/file/read-file.test.ts`

- [ ] **Step 1: Add tracker.set call after successful read**

In `apps/backend/src/agent/tools/file/read-file.ts`, add this line right before the return statement at the end (before line 156):

```typescript
// 8. Track file stat for modification safety
context.fileStatTracker.set(absolutePath, stat.size, stat.mtimeMs);

return `${header}\n${formatted}`;
```

- [ ] **Step 2: Add test verifying tracker is updated**

Add this test to `apps/backend/src/agent/tools/file/read-file.test.ts` inside the `describe('success cases')` block:

```typescript
it('tracks file stat after successful read', async () => {
  await writeFile('tracked.txt', 'content');
  const stat = await fs.stat(path.join(tmpDir, 'tracked.txt'));

  await readFileTool.execute({filePath: 'tracked.txt'}, context);

  const result = context.fileStatTracker.canModify(
    path.join(tmpDir, 'tracked.txt'),
    stat.size,
    stat.mtimeMs,
  );
  expect(result).toBe('ok');
});
```

Note: Add the `FileStatCheckResult` import if needed, or just use the string value `'ok'` directly.

- [ ] **Step 3: Run tests**

```bash
cd apps/backend && bun run test -- src/agent/tools/file/read-file.test.ts
```

Expected: all tests PASS

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/agent/tools/file/read-file.ts apps/backend/src/agent/tools/file/read-file.test.ts
git commit -m "feat(backend): track file stat in read_file tool"
```

---

### Task 4: Integrate into write_file

**Files:**

- Modify: `apps/backend/src/agent/tools/file/write-file.ts`
- Modify: `apps/backend/src/agent/tools/file/write-file.test.ts`

- [ ] **Step 1: Add canModify check and stat update**

In `apps/backend/src/agent/tools/file/write-file.ts`:

Add import at the top:

```typescript
import type {Stats} from 'node:fs';
```

Add `FileStatCheckResult` import:

```typescript
import {FileStatCheckResult} from '@/agent-core/agent/index.js';
```

After the security check (after line 58), add file existence check + canModify:

```typescript
// 4. Check if file exists — if so, verify it was read first
let existingStat: Stats | null = null;
try {
  existingStat = await fs.stat(absolutePath);
} catch {
  // File doesn't exist, which is fine for write_file
}

if (existingStat) {
  const checkResult = context.fileStatTracker.canModify(
    absolutePath,
    existingStat.size,
    existingStat.mtimeMs,
  );
  if (checkResult === FileStatCheckResult.NOT_READ) {
    return 'Error: Read the file before modifying it';
  }
  if (checkResult === FileStatCheckResult.MODIFIED_SINCE_LAST_READ) {
    return 'Error: File has been modified since last read. Read the file again before modifying it';
  }
}
```

After the write succeeds (after line 65), add stat tracking:

```typescript
// 6. Track new file stat
const newStat = await fs.stat(absolutePath);
context.fileStatTracker.set(absolutePath, newStat.size, newStat.mtimeMs);
```

Update the line count step number and return.

- [ ] **Step 2: Add tests for stat tracking**

Add these tests to `apps/backend/src/agent/tools/file/write-file.test.ts`:

In `describe('success cases')`:

```typescript
it('allows overwriting a file that was read first', async () => {
  const filePath = path.join(tmpDir, 'read-first.txt');
  await fs.writeFile(filePath, 'old');
  const stat = await fs.stat(filePath);
  context.fileStatTracker.set(filePath, stat.size, stat.mtimeMs);

  const result = await writeFileTool.execute(
    {filePath: 'read-first.txt', content: 'new'},
    context,
  );

  expect(result).toContain('File written:');
});
```

In `describe('error cases')`:

```typescript
it('rejects overwriting a file that was not read', async () => {
  await fs.writeFile(path.join(tmpDir, 'unread.txt'), 'old');

  const result = await writeFileTool.execute(
    {filePath: 'unread.txt', content: 'new'},
    context,
  );

  expect(result).toContain('Error: Read the file before modifying it');
});

it('rejects overwriting a file modified since last read', async () => {
  const filePath = path.join(tmpDir, 'stale.txt');
  await fs.writeFile(filePath, 'old');
  // Track with old stat
  context.fileStatTracker.set(filePath, 0, 0);

  const result = await writeFileTool.execute(
    {filePath: 'stale.txt', content: 'new'},
    context,
  );

  expect(result).toContain('Error: File has been modified since last read');
});

it('allows creating a new file without prior read', async () => {
  const result = await writeFileTool.execute(
    {filePath: 'brand-new.txt', content: 'fresh'},
    context,
  );

  expect(result).toContain('File written:');
});
```

- [ ] **Step 3: Run tests**

```bash
cd apps/backend && bun run test -- src/agent/tools/file/write-file.test.ts
```

Expected: all tests PASS

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/agent/tools/file/write-file.ts apps/backend/src/agent/tools/file/write-file.test.ts
git commit -m "feat(backend): add stat tracking to write_file tool"
```

---

### Task 5: Integrate into edit_file

**Files:**

- Modify: `apps/backend/src/agent/tools/file/edit-file.ts`
- Modify: `apps/backend/src/agent/tools/file/edit-file.test.ts`

- [ ] **Step 1: Add canModify check and stat update**

In `apps/backend/src/agent/tools/file/edit-file.ts`:

Add import:

```typescript
import {FileStatCheckResult} from '@/agent-core/agent/index.js';
```

After the file size check (after line 90 `return ... byte limit`), add canModify:

```typescript
const checkResult = context.fileStatTracker.canModify(
  absolutePath,
  stat.size,
  stat.mtimeMs,
);
if (checkResult === FileStatCheckResult.NOT_READ) {
  return 'Error: Read the file before modifying it';
}
if (checkResult === FileStatCheckResult.MODIFIED_SINCE_LAST_READ) {
  return 'Error: File has been modified since last read. Read the file again before modifying it';
}
```

After the write succeeds (after line 121 `await fs.writeFile(...)` try/catch), add stat tracking:

```typescript
// Track new file stat
const newStat = await fs.stat(absolutePath);
context.fileStatTracker.set(absolutePath, newStat.size, newStat.mtimeMs);
```

- [ ] **Step 2: Add tests for stat tracking**

Add these tests to `apps/backend/src/agent/tools/file/edit-file.test.ts`:

In `describe('success cases')`:

```typescript
it('succeeds when file was read first', async () => {
  const filePath = path.join(tmpDir, 'tracked.ts');
  await fs.writeFile(filePath, 'old line\n');
  const stat = await fs.stat(filePath);
  context.fileStatTracker.set(filePath, stat.size, stat.mtimeMs);

  const result = await editFileTool.execute(
    {filePath: 'tracked.ts', oldString: 'old line', newString: 'new line'},
    context,
  );

  expect(result).toContain('File edited:');
});
```

In `describe('error cases')`:

```typescript
it('rejects editing a file that was not read', async () => {
  await writeFile('unread.ts', 'content');

  const result = await editFileTool.execute(
    {filePath: 'unread.ts', oldString: 'content', newString: 'new'},
    context,
  );

  expect(result).toContain('Error: Read the file before modifying it');
});

it('rejects editing a file modified since last read', async () => {
  const filePath = await writeFile('stale.ts', 'old content');
  // Track with stale stat
  context.fileStatTracker.set(filePath, 0, 0);

  const result = await editFileTool.execute(
    {filePath: 'stale.ts', oldString: 'old content', newString: 'new'},
    context,
  );

  expect(result).toContain('Error: File has been modified since last read');
});
```

- [ ] **Step 3: Run all tests and typecheck**

```bash
cd apps/backend && bun run test && bun run typecheck
```

Expected: all tests PASS, no type errors

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/agent/tools/file/edit-file.ts apps/backend/src/agent/tools/file/edit-file.test.ts
git commit -m "feat(backend): add stat tracking to edit_file tool"
```
