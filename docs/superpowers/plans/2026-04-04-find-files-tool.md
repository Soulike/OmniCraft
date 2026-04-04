# Find Files Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `find_files` tool to the Agent's FileToolRegistry that searches for files by glob pattern.

**Architecture:** New tool follows the existing `ToolDefinition` pattern used by `read_file`. Uses `fast-glob` library for glob matching. Integrates into the existing `FileToolRegistry` singleton.

**Tech Stack:** TypeScript, fast-glob, Zod, Vitest

**Spec:** `docs/superpowers/specs/2026-04-04-find-files-tool-design.md`

---

### Task 1: Install fast-glob dependency

**Files:**

- Modify: `apps/backend/package.json`

- [ ] **Step 1: Install fast-glob**

Run from repo root:

```bash
cd apps/backend && bun add fast-glob
```

- [ ] **Step 2: Verify installation**

```bash
cd apps/backend && bun run typecheck
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/backend/package.json bun.lock
git commit -m "chore(backend): add fast-glob dependency"
```

---

### Task 2: Write tests for find_files tool

**Files:**

- Create: `apps/backend/src/agent/tools/file/find-files.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {FileContentCache} from '@/agent-core/agent/index.js';
import {createMockContext} from '@/agent-core/tool/testing.js';
import type {ToolExecutionContext} from '@/agent-core/tool/types.js';

import {findFilesTool} from './find-files.js';

describe('findFilesTool', () => {
  let tmpDir: string;
  let context: ToolExecutionContext;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fft-test-'));
    context = createMockContext({
      workingDirectory: tmpDir,
      fileCache: new FileContentCache(),
    });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  async function writeFile(name: string, content = ''): Promise<string> {
    const filePath = path.join(tmpDir, name);
    await fs.mkdir(path.dirname(filePath), {recursive: true});
    await fs.writeFile(filePath, content);
    return filePath;
  }

  it('has the correct name', () => {
    expect(findFilesTool.name).toBe('find_files');
  });

  describe('success cases', () => {
    it('finds files matching a simple pattern', async () => {
      await writeFile('a.ts', '');
      await writeFile('b.ts', '');
      await writeFile('c.js', '');

      const result = await findFilesTool.execute({pattern: '**/*.ts'}, context);

      expect(result).toContain('Found 2 files');
      expect(result).toContain('a.ts');
      expect(result).toContain('b.ts');
      expect(result).not.toContain('c.js');
    });

    it('finds files in subdirectories', async () => {
      await writeFile('src/foo.ts', '');
      await writeFile('src/bar/baz.ts', '');

      const result = await findFilesTool.execute(
        {pattern: 'src/**/*.ts'},
        context,
      );

      expect(result).toContain('Found 2 files');
      expect(result).toContain('src/foo.ts');
      expect(result).toContain('src/bar/baz.ts');
    });

    it('returns results sorted alphabetically', async () => {
      await writeFile('c.ts', '');
      await writeFile('a.ts', '');
      await writeFile('b.ts', '');

      const result = await findFilesTool.execute({pattern: '**/*.ts'}, context);

      const lines = result.split('\n');
      const filePaths = lines.filter((l) => l.endsWith('.ts'));
      expect(filePaths).toEqual(['a.ts', 'b.ts', 'c.ts']);
    });

    it('matches dotfiles when dot is in pattern', async () => {
      await writeFile('.env', '');
      await writeFile('.gitignore', '');
      await writeFile('readme.md', '');

      const result = await findFilesTool.execute({pattern: '.*'}, context);

      expect(result).toContain('.env');
      expect(result).toContain('.gitignore');
      expect(result).not.toContain('readme.md');
    });

    it('searches within a custom path', async () => {
      await writeFile('src/a.ts', '');
      await writeFile('lib/b.ts', '');

      const result = await findFilesTool.execute(
        {pattern: '**/*.ts', path: 'src'},
        context,
      );

      expect(result).toContain('a.ts');
      expect(result).not.toContain('b.ts');
    });

    it('searches with an absolute custom path', async () => {
      await writeFile('src/a.ts', '');
      await writeFile('lib/b.ts', '');

      const result = await findFilesTool.execute(
        {pattern: '**/*.ts', path: path.join(tmpDir, 'src')},
        context,
      );

      expect(result).toContain('a.ts');
      expect(result).not.toContain('b.ts');
    });

    it('supports brace expansion (or semantics)', async () => {
      await writeFile('a.ts', '');
      await writeFile('b.tsx', '');
      await writeFile('c.js', '');

      const result = await findFilesTool.execute(
        {pattern: '**/*.{ts,tsx}'},
        context,
      );

      expect(result).toContain('a.ts');
      expect(result).toContain('b.tsx');
      expect(result).not.toContain('c.js');
    });

    it('returns no-match message when nothing found', async () => {
      const result = await findFilesTool.execute(
        {pattern: '**/*.xyz'},
        context,
      );

      expect(result).toContain('No files found matching');
    });

    it('truncates results exceeding 100 entries', async () => {
      const writes = Array.from({length: 120}, (_, i) =>
        writeFile(`file${String(i).padStart(3, '0')}.ts`, ''),
      );
      await Promise.all(writes);

      const result = await findFilesTool.execute({pattern: '**/*.ts'}, context);

      expect(result).toContain('Found 100 of 120 files');
      expect(result).toContain('truncated');
      expect(result).toContain('Use a more specific pattern');
    });
  });

  describe('extraAllowedPaths', () => {
    let extraDir: string;

    beforeEach(async () => {
      extraDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fft-extra-'));
    });

    afterEach(async () => {
      await fs.rm(extraDir, {recursive: true, force: true});
    });

    it('allows searching in an extra allowed path', async () => {
      await fs.writeFile(path.join(extraDir, 'lib.ts'), '');

      const extraContext = createMockContext({
        workingDirectory: tmpDir,
        fileCache: new FileContentCache(),
        extraAllowedPaths: [{path: extraDir, mode: 'read'}],
      });

      const result = await findFilesTool.execute(
        {pattern: '**/*.ts', path: extraDir},
        extraContext,
      );

      expect(result).toContain('lib.ts');
    });
  });

  describe('error cases', () => {
    it('rejects path outside workingDirectory', async () => {
      const result = await findFilesTool.execute(
        {pattern: '**/*.ts', path: '/etc'},
        context,
      );

      expect(result).toContain('Error: Access denied');
    });

    it('rejects path traversal attacks', async () => {
      const result = await findFilesTool.execute(
        {pattern: '**/*.ts', path: '../../../etc'},
        context,
      );

      expect(result).toContain('Error: Access denied');
    });

    it('returns error for nonexistent directory', async () => {
      const result = await findFilesTool.execute(
        {pattern: '**/*.ts', path: 'nonexistent'},
        context,
      );

      expect(result).toContain('Error: Directory not found');
    });

    it('returns error when path is a file', async () => {
      await writeFile('afile.txt', 'content');

      const result = await findFilesTool.execute(
        {pattern: '**/*.ts', path: 'afile.txt'},
        context,
      );

      expect(result).toContain('Error: Not a directory');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/backend && bun run test -- src/agent/tools/file/find-files.test.ts
```

Expected: FAIL (cannot resolve `./find-files.js`)

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/agent/tools/file/find-files.test.ts
git commit -m "test(backend): add find_files tool tests"
```

---

### Task 3: Implement find_files tool

**Files:**

- Create: `apps/backend/src/agent/tools/file/find-files.ts`

- [ ] **Step 1: Write the implementation**

```typescript
import fs from 'node:fs/promises';
import path from 'node:path';

import fg from 'fast-glob';
import {z} from 'zod';

import type {
  ToolDefinition,
  ToolExecutionContext,
} from '@/agent-core/tool/index.js';

import {isSubPath} from './helpers.js';

const MAX_RESULTS = 100;

const parameters = z.object({
  pattern: z
    .string()
    .describe(
      'Glob pattern to match files, e.g. "**/*.ts", "src/{components,hooks}/**/*.ts"',
    ),
  path: z
    .string()
    .optional()
    .describe(
      'Search root directory (relative or absolute), defaults to working directory',
    ),
});

type FindFilesArgs = z.infer<typeof parameters>;

/** Built-in tool that searches for files matching a glob pattern. */
export const findFilesTool: ToolDefinition<typeof parameters> = {
  name: 'find_files',
  displayName: 'Find Files',
  description:
    'Searches for files matching a glob pattern and returns their paths.',
  parameters,
  async execute(
    args: FindFilesArgs,
    context: ToolExecutionContext,
  ): Promise<string> {
    const {workingDirectory} = context;

    // 1. Resolve search directory
    const searchDir = path.resolve(workingDirectory, args.path ?? '.');

    // 2. Security check
    if (
      searchDir !== path.resolve(workingDirectory) &&
      !isSubPath(workingDirectory, searchDir)
    ) {
      const allowed = context.extraAllowedPaths.some(
        (entry) =>
          searchDir === path.resolve(entry.path) ||
          isSubPath(entry.path, searchDir),
      );
      if (!allowed) {
        return 'Error: Access denied: path is outside the allowed directories';
      }
    }

    // 3. Verify directory exists
    let stat: Awaited<ReturnType<typeof fs.stat>>;
    try {
      stat = await fs.stat(searchDir);
    } catch {
      return `Error: Directory not found: ${args.path}`;
    }

    if (!stat.isDirectory()) {
      return `Error: Not a directory: ${args.path}`;
    }

    // 4. Run fast-glob
    let entries: string[];
    try {
      entries = await fg(args.pattern, {
        cwd: searchDir,
        onlyFiles: true,
        dot: true,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return `Error: ${message}`;
    }

    // 5. Sort alphabetically
    entries.sort();

    // 6. Format output
    const displayPath = args.path ?? workingDirectory;

    if (entries.length === 0) {
      return `No files found matching "${args.pattern}" in ${displayPath}.`;
    }

    const total = entries.length;
    const truncated = total > MAX_RESULTS;
    const shown = truncated ? entries.slice(0, MAX_RESULTS) : entries;

    const header = truncated
      ? `Found ${MAX_RESULTS} of ${total} files matching "${args.pattern}" in ${displayPath} (truncated):`
      : `Found ${total} files matching "${args.pattern}" in ${displayPath}:`;

    const body = shown.join('\n');

    const footer = truncated
      ? `\nShowing ${MAX_RESULTS} of ${total} results. Use a more specific pattern to narrow down.`
      : '';

    return `${header}\n${body}${footer}`;
  },
};
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
cd apps/backend && bun run test -- src/agent/tools/file/find-files.test.ts
```

Expected: all tests PASS

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/agent/tools/file/find-files.ts
git commit -m "feat(backend): implement find_files tool"
```

---

### Task 4: Register and export the tool

**Files:**

- Modify: `apps/backend/src/agent/tools/file/file-tool-registry.ts`
- Modify: `apps/backend/src/agent/tools/file/index.ts`

- [ ] **Step 1: Register in FileToolRegistry**

In `file-tool-registry.ts`, add the import and register call:

```typescript
import {ToolRegistry} from '@/agent-core/tool/index.js';

import {findFilesTool} from './find-files.js';
import {readFileTool} from './read-file.js';

/** Registry for file-operation tools. */
export class FileToolRegistry extends ToolRegistry {
  /** Creates the singleton and registers all file tools. */
  static override create(): FileToolRegistry {
    const instance = super.create() as FileToolRegistry;
    instance.register(readFileTool);
    instance.register(findFilesTool);
    return instance;
  }
}
```

- [ ] **Step 2: Export from index.ts**

In `index.ts`, add the export:

```typescript
export {FileToolRegistry} from './file-tool-registry.js';
export {findFilesTool} from './find-files.js';
export {readFileTool} from './read-file.js';
```

- [ ] **Step 3: Run all tests to verify nothing broke**

```bash
cd apps/backend && bun run test
```

Expected: all tests PASS

- [ ] **Step 4: Run typecheck and lint**

```bash
cd apps/backend && bun run typecheck
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/agent/tools/file/file-tool-registry.ts apps/backend/src/agent/tools/file/index.ts
git commit -m "feat(backend): register find_files tool in FileToolRegistry"
```
