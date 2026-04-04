# Write File Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `write_file` tool to the Agent's FileToolRegistry that creates or overwrites files.

**Architecture:** Simple tool following existing `read_file` patterns. Security check requires `read-write` mode for extraAllowedPaths. Auto-creates parent directories.

**Tech Stack:** TypeScript, Node.js fs, Zod, Vitest

**Spec:** `docs/superpowers/specs/2026-04-04-write-file-tool-design.md`

---

### Task 1: Write tests for write_file tool

**Files:**

- Create: `apps/backend/src/agent/tools/file/write-file.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {FileContentCache} from '@/agent-core/agent/index.js';
import {createMockContext} from '@/agent-core/tool/testing.js';
import type {ToolExecutionContext} from '@/agent-core/tool/types.js';

import {writeFileTool} from './write-file.js';

describe('writeFileTool', () => {
  let tmpDir: string;
  let context: ToolExecutionContext;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wft-test-'));
    context = createMockContext({
      workingDirectory: tmpDir,
      fileCache: new FileContentCache(),
    });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  it('has the correct name', () => {
    expect(writeFileTool.name).toBe('write_file');
  });

  describe('success cases', () => {
    it('creates a new file', async () => {
      const result = await writeFileTool.execute(
        {filePath: 'hello.txt', content: 'hello world'},
        context,
      );

      expect(result).toContain('File written: hello.txt');
      expect(result).toContain('1 lines');
      const written = await fs.readFile(
        path.join(tmpDir, 'hello.txt'),
        'utf-8',
      );
      expect(written).toBe('hello world');
    });

    it('overwrites an existing file', async () => {
      const filePath = path.join(tmpDir, 'existing.txt');
      await fs.writeFile(filePath, 'old content');

      const result = await writeFileTool.execute(
        {filePath: 'existing.txt', content: 'new content'},
        context,
      );

      expect(result).toContain('File written: existing.txt');
      const written = await fs.readFile(filePath, 'utf-8');
      expect(written).toBe('new content');
    });

    it('auto-creates parent directories', async () => {
      const result = await writeFileTool.execute(
        {filePath: 'deep/nested/dir/file.txt', content: 'deep content'},
        context,
      );

      expect(result).toContain('File written: deep/nested/dir/file.txt');
      const written = await fs.readFile(
        path.join(tmpDir, 'deep/nested/dir/file.txt'),
        'utf-8',
      );
      expect(written).toBe('deep content');
    });

    it('counts lines correctly', async () => {
      const result = await writeFileTool.execute(
        {filePath: 'multi.txt', content: 'line1\nline2\nline3'},
        context,
      );

      expect(result).toContain('3 lines');
    });

    it('handles empty content', async () => {
      const result = await writeFileTool.execute(
        {filePath: 'empty.txt', content: ''},
        context,
      );

      expect(result).toContain('File written: empty.txt');
      expect(result).toContain('0 lines');
    });

    it('accepts absolute paths within workingDirectory', async () => {
      const absPath = path.join(tmpDir, 'abs.txt');
      const result = await writeFileTool.execute(
        {filePath: absPath, content: 'absolute'},
        context,
      );

      expect(result).toContain('File written:');
      const written = await fs.readFile(absPath, 'utf-8');
      expect(written).toBe('absolute');
    });
  });

  describe('extraAllowedPaths', () => {
    let extraDir: string;

    beforeEach(async () => {
      extraDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wft-extra-'));
    });

    afterEach(async () => {
      await fs.rm(extraDir, {recursive: true, force: true});
    });

    it('allows writing in a read-write extra path', async () => {
      const extraContext = createMockContext({
        workingDirectory: tmpDir,
        fileCache: new FileContentCache(),
        extraAllowedPaths: [{path: extraDir, mode: 'read-write'}],
      });

      const filePath = path.join(extraDir, 'extra.txt');
      const result = await writeFileTool.execute(
        {filePath, content: 'extra content'},
        extraContext,
      );

      expect(result).toContain('File written:');
      const written = await fs.readFile(filePath, 'utf-8');
      expect(written).toBe('extra content');
    });

    it('rejects writing in a read-only extra path', async () => {
      const extraContext = createMockContext({
        workingDirectory: tmpDir,
        fileCache: new FileContentCache(),
        extraAllowedPaths: [{path: extraDir, mode: 'read'}],
      });

      const filePath = path.join(extraDir, 'readonly.txt');
      const result = await writeFileTool.execute(
        {filePath, content: 'should fail'},
        extraContext,
      );

      expect(result).toContain('Error: Access denied: path is read-only');
    });
  });

  describe('error cases', () => {
    it('rejects paths outside workingDirectory', async () => {
      const result = await writeFileTool.execute(
        {filePath: '/etc/evil.txt', content: 'hack'},
        context,
      );

      expect(result).toContain(
        'Error: Access denied: path is outside the allowed directories',
      );
    });

    it('rejects path traversal attacks', async () => {
      const result = await writeFileTool.execute(
        {filePath: '../../../etc/evil.txt', content: 'hack'},
        context,
      );

      expect(result).toContain('Error: Access denied');
    });

    it('rejects content exceeding 1MB', async () => {
      const bigContent = 'x'.repeat(1_048_577);
      const result = await writeFileTool.execute(
        {filePath: 'big.txt', content: bigContent},
        context,
      );

      expect(result).toContain('Error: Content exceeds');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/backend && bun run test -- src/agent/tools/file/write-file.test.ts
```

Expected: FAIL (cannot resolve `./write-file.js`)

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/agent/tools/file/write-file.test.ts
git commit -m "test(backend): add write_file tool tests"
```

---

### Task 2: Implement write_file tool

**Files:**

- Create: `apps/backend/src/agent/tools/file/write-file.ts`

- [ ] **Step 1: Write the implementation**

```typescript
import fs from 'node:fs/promises';
import path from 'node:path';

import {z} from 'zod';

import type {
  ToolDefinition,
  ToolExecutionContext,
} from '@/agent-core/tool/index.js';

import {countLines, isSubPath} from './helpers.js';

const MAX_CONTENT_SIZE = 1_048_576; // 1MB

const parameters = z.object({
  filePath: z
    .string()
    .min(1)
    .describe('File path, absolute or relative to working directory'),
  content: z.string().describe('File content to write'),
});

type WriteFileArgs = z.infer<typeof parameters>;

/** Built-in tool that creates or overwrites a file. */
export const writeFileTool: ToolDefinition<typeof parameters> = {
  name: 'write_file',
  displayName: 'Write File',
  description:
    'Creates a new file or overwrites an existing file. ' +
    'Prefer editing over overwriting when modifying existing files.',
  parameters,
  async execute(
    args: WriteFileArgs,
    context: ToolExecutionContext,
  ): Promise<string> {
    const {workingDirectory} = context;

    // 1. Check content size
    if (Buffer.byteLength(args.content) > MAX_CONTENT_SIZE) {
      return `Error: Content exceeds ${MAX_CONTENT_SIZE} byte limit`;
    }

    // 2. Resolve path
    const absolutePath = path.resolve(workingDirectory, args.filePath);

    // 3. Security check
    if (!isSubPath(workingDirectory, absolutePath)) {
      const matchedEntry = context.extraAllowedPaths.find((entry) =>
        isSubPath(entry.path, absolutePath),
      );
      if (!matchedEntry) {
        return 'Error: Access denied: path is outside the allowed directories';
      }
      if (matchedEntry.mode === 'read') {
        return 'Error: Access denied: path is read-only';
      }
    }

    // 4. Auto-create parent directories
    await fs.mkdir(path.dirname(absolutePath), {recursive: true});

    // 5. Write file
    try {
      await fs.writeFile(absolutePath, args.content, 'utf-8');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return `Error: ${message}`;
    }

    // 6. Count lines and return success
    const lineCount = await countLines(Buffer.from(args.content));
    return `File written: ${args.filePath} (${lineCount} lines)`;
  },
};
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
cd apps/backend && bun run test -- src/agent/tools/file/write-file.test.ts
```

Expected: all tests PASS

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/agent/tools/file/write-file.ts
git commit -m "feat(backend): implement write_file tool"
```

---

### Task 3: Register and export the tool

**Files:**

- Modify: `apps/backend/src/agent/tools/file/file-tool-registry.ts`
- Modify: `apps/backend/src/agent/tools/file/index.ts`

- [ ] **Step 1: Register in FileToolRegistry**

Update `file-tool-registry.ts`:

```typescript
import {ToolRegistry} from '@/agent-core/tool/index.js';

import {findFilesTool} from './find-files.js';
import {readFileTool} from './read-file.js';
import {searchFilesTool} from './search-files.js';
import {writeFileTool} from './write-file.js';

/** Registry for file-operation tools. */
export class FileToolRegistry extends ToolRegistry {
  /** Creates the singleton and registers all file tools. */
  static override create(): FileToolRegistry {
    const instance = super.create() as FileToolRegistry;
    instance.register(readFileTool);
    instance.register(findFilesTool);
    instance.register(searchFilesTool);
    instance.register(writeFileTool);
    return instance;
  }
}
```

- [ ] **Step 2: Export from index.ts**

Update `index.ts`:

```typescript
export {FileToolRegistry} from './file-tool-registry.js';
export {findFilesTool} from './find-files.js';
export {readFileTool} from './read-file.js';
export {searchFilesTool} from './search-files.js';
export {writeFileTool} from './write-file.js';
```

- [ ] **Step 3: Run all tests and typecheck**

```bash
cd apps/backend && bun run test && bun run typecheck
```

Expected: all tests PASS, no type errors

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/agent/tools/file/file-tool-registry.ts apps/backend/src/agent/tools/file/index.ts
git commit -m "feat(backend): register write_file tool in FileToolRegistry"
```
