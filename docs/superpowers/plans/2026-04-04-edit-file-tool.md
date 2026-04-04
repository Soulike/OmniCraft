# Edit File Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `edit_file` tool to the Agent's FileToolRegistry that makes targeted string replacements in existing files and returns a unified diff.

**Architecture:** Follows `write_file` security patterns. Uses `diff` npm library for unified diff generation. Supports single replacement (default, requires unique match) and replaceAll mode.

**Tech Stack:** TypeScript, diff (npm), Node.js fs, Zod, Vitest

**Spec:** `docs/superpowers/specs/2026-04-04-edit-file-tool-design.md`

---

### Task 1: Install diff dependency

**Files:**

- Modify: `apps/backend/package.json`

- [ ] **Step 1: Install diff**

```bash
cd apps/backend && bun add diff
```

- [ ] **Step 2: Verify typecheck**

```bash
cd apps/backend && bun run typecheck
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/backend/package.json bun.lock
git commit -m "chore(backend): add diff dependency"
```

---

### Task 2: Write tests and implement edit_file tool

**Files:**

- Create: `apps/backend/src/agent/tools/file/edit-file.test.ts`
- Create: `apps/backend/src/agent/tools/file/edit-file.ts`

- [ ] **Step 1: Write the test file**

Create `apps/backend/src/agent/tools/file/edit-file.test.ts`:

```typescript
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {FileContentCache} from '@/agent-core/agent/index.js';
import {createMockContext} from '@/agent-core/tool/testing.js';
import type {ToolExecutionContext} from '@/agent-core/tool/types.js';

import {editFileTool} from './edit-file.js';

describe('editFileTool', () => {
  let tmpDir: string;
  let context: ToolExecutionContext;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'eft-test-'));
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
    expect(editFileTool.name).toBe('edit_file');
  });

  describe('success cases', () => {
    it('replaces a unique string', async () => {
      await writeFile('test.ts', 'const x = 1;\nconst y = 2;\n');

      const result = await editFileTool.execute(
        {
          filePath: 'test.ts',
          oldString: 'const x = 1;',
          newString: 'const x = 42;',
        },
        context,
      );

      expect(result).toContain('File edited: test.ts');
      expect(result).toContain('1 replacement(s)');
      expect(result).toContain('-const x = 1;');
      expect(result).toContain('+const x = 42;');
      const written = await fs.readFile(path.join(tmpDir, 'test.ts'), 'utf-8');
      expect(written).toBe('const x = 42;\nconst y = 2;\n');
    });

    it('replaces all occurrences with replaceAll', async () => {
      await writeFile('test.ts', 'foo\nbar\nfoo\nbaz\nfoo\n');

      const result = await editFileTool.execute(
        {
          filePath: 'test.ts',
          oldString: 'foo',
          newString: 'qux',
          replaceAll: true,
        },
        context,
      );

      expect(result).toContain('3 replacement(s)');
      const written = await fs.readFile(path.join(tmpDir, 'test.ts'), 'utf-8');
      expect(written).toBe('qux\nbar\nqux\nbaz\nqux\n');
    });

    it('returns unified diff in output', async () => {
      await writeFile('test.ts', 'line1\nold line\nline3\n');

      const result = await editFileTool.execute(
        {filePath: 'test.ts', oldString: 'old line', newString: 'new line'},
        context,
      );

      expect(result).toContain('---');
      expect(result).toContain('+++');
      expect(result).toContain('-old line');
      expect(result).toContain('+new line');
    });

    it('truncates large diffs at 4KB', async () => {
      const longOld = 'x'.repeat(3000);
      const longNew = 'y'.repeat(3000);
      await writeFile('big.ts', `before\n${longOld}\nafter\n`);

      const result = await editFileTool.execute(
        {filePath: 'big.ts', oldString: longOld, newString: longNew},
        context,
      );

      expect(result).toContain('File edited: big.ts');
      expect(result).toContain('Diff truncated');
      expect(result).toContain('Read the file to review');
    });

    it('accepts absolute paths within workingDirectory', async () => {
      const absPath = await writeFile('abs.txt', 'old');

      const result = await editFileTool.execute(
        {filePath: absPath, oldString: 'old', newString: 'new'},
        context,
      );

      expect(result).toContain('File edited:');
    });
  });

  describe('extraAllowedPaths', () => {
    let extraDir: string;

    beforeEach(async () => {
      extraDir = await fs.mkdtemp(path.join(os.tmpdir(), 'eft-extra-'));
    });

    afterEach(async () => {
      await fs.rm(extraDir, {recursive: true, force: true});
    });

    it('allows editing in a read-write extra path', async () => {
      const filePath = path.join(extraDir, 'extra.txt');
      await fs.writeFile(filePath, 'old content');

      const extraContext = createMockContext({
        workingDirectory: tmpDir,
        fileCache: new FileContentCache(),
        extraAllowedPaths: [{path: extraDir, mode: 'read-write'}],
      });

      const result = await editFileTool.execute(
        {filePath, oldString: 'old', newString: 'new'},
        extraContext,
      );

      expect(result).toContain('File edited:');
      const written = await fs.readFile(filePath, 'utf-8');
      expect(written).toBe('new content');
    });

    it('rejects editing in a read-only extra path', async () => {
      const filePath = path.join(extraDir, 'readonly.txt');
      await fs.writeFile(filePath, 'content');

      const extraContext = createMockContext({
        workingDirectory: tmpDir,
        fileCache: new FileContentCache(),
        extraAllowedPaths: [{path: extraDir, mode: 'read'}],
      });

      const result = await editFileTool.execute(
        {filePath, oldString: 'content', newString: 'new'},
        extraContext,
      );

      expect(result).toContain('Error: Access denied: path is read-only');
    });
  });

  describe('error cases', () => {
    it('rejects paths outside workingDirectory', async () => {
      const result = await editFileTool.execute(
        {filePath: '/etc/passwd', oldString: 'a', newString: 'b'},
        context,
      );

      expect(result).toContain(
        'Error: Access denied: path is outside the allowed directories',
      );
    });

    it('rejects path traversal attacks', async () => {
      const result = await editFileTool.execute(
        {filePath: '../../../etc/passwd', oldString: 'a', newString: 'b'},
        context,
      );

      expect(result).toContain('Error: Access denied');
    });

    it('returns error for nonexistent file', async () => {
      const result = await editFileTool.execute(
        {filePath: 'nope.txt', oldString: 'a', newString: 'b'},
        context,
      );

      expect(result).toContain('Error: File not found');
    });

    it('returns error for directories', async () => {
      await fs.mkdir(path.join(tmpDir, 'adir'));

      const result = await editFileTool.execute(
        {filePath: 'adir', oldString: 'a', newString: 'b'},
        context,
      );

      expect(result).toContain('Error: Not a file');
    });

    it('returns error when oldString not found', async () => {
      await writeFile('test.ts', 'hello world');

      const result = await editFileTool.execute(
        {filePath: 'test.ts', oldString: 'nonexistent', newString: 'new'},
        context,
      );

      expect(result).toContain('Error: old string not found');
    });

    it('returns error on multiple matches without replaceAll', async () => {
      await writeFile('test.ts', 'foo\nbar\nfoo\n');

      const result = await editFileTool.execute(
        {filePath: 'test.ts', oldString: 'foo', newString: 'baz'},
        context,
      );

      expect(result).toContain('Error: Found 2 matches');
      expect(result).toContain('replaceAll');
    });
  });
});
```

- [ ] **Step 2: Write the implementation**

Create `apps/backend/src/agent/tools/file/edit-file.ts`:

```typescript
import type {Stats} from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import {createPatch} from 'diff';
import {z} from 'zod';

import type {
  ToolDefinition,
  ToolExecutionContext,
} from '@/agent-core/tool/index.js';

import {isSubPath} from './helpers.js';

const MAX_DIFF_SIZE = 4_096; // 4KB

const parameters = z.object({
  filePath: z
    .string()
    .min(1)
    .describe('File path, absolute or relative to working directory'),
  oldString: z.string().min(1).describe('The exact string to find and replace'),
  newString: z.string().describe('The replacement string'),
  replaceAll: z
    .boolean()
    .optional()
    .describe(
      'Replace all occurrences. Defaults to false (requires unique match)',
    ),
});

type EditFileArgs = z.infer<typeof parameters>;

/** Counts non-overlapping occurrences of a substring in a string. */
function countOccurrences(content: string, search: string): number {
  let count = 0;
  let index = 0;
  while ((index = content.indexOf(search, index)) !== -1) {
    count++;
    index += search.length;
  }
  return count;
}

/** Built-in tool that makes targeted string replacements in a file. */
export const editFileTool: ToolDefinition<typeof parameters> = {
  name: 'edit_file',
  displayName: 'Edit File',
  description:
    'Replaces a specific string in a file. ' +
    'Requires the old string to uniquely match unless replaceAll is set.',
  parameters,
  async execute(
    args: EditFileArgs,
    context: ToolExecutionContext,
  ): Promise<string> {
    const {workingDirectory} = context;

    // 1. Resolve path
    const absolutePath = path.resolve(workingDirectory, args.filePath);

    // 2. Security check
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

    // 3. Read file
    let stat: Stats;
    try {
      stat = await fs.stat(absolutePath);
    } catch {
      return `Error: File not found: ${args.filePath}`;
    }

    if (!stat.isFile()) {
      return `Error: Not a file: ${args.filePath}`;
    }

    let oldContent: string;
    try {
      oldContent = await fs.readFile(absolutePath, 'utf-8');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return `Error: ${message}`;
    }

    // 4. Count occurrences
    const matchCount = countOccurrences(oldContent, args.oldString);

    if (matchCount === 0) {
      return `Error: old string not found in ${args.filePath}`;
    }

    if (matchCount > 1 && !args.replaceAll) {
      return (
        `Error: Found ${matchCount} matches in ${args.filePath}. ` +
        'Provide more context to make a unique match, or set replaceAll to replace all occurrences.'
      );
    }

    // 5. Perform replacement
    const newContent = args.replaceAll
      ? oldContent.replaceAll(args.oldString, args.newString)
      : oldContent.replace(args.oldString, args.newString);

    // 6. Write file
    try {
      await fs.writeFile(absolutePath, newContent, 'utf-8');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return `Error: ${message}`;
    }

    // 7. Generate diff
    const diff = createPatch(args.filePath, oldContent, newContent);
    const header = `File edited: ${args.filePath} (${matchCount} replacement(s))`;

    if (Buffer.byteLength(diff) > MAX_DIFF_SIZE) {
      const truncated = diff.slice(0, MAX_DIFF_SIZE);
      return `${header}\n${truncated}\n... Diff truncated. Read the file to review the modified sections.`;
    }

    return `${header}\n${diff}`;
  },
};
```

- [ ] **Step 3: Run tests**

```bash
cd apps/backend && bun run test -- src/agent/tools/file/edit-file.test.ts
```

Expected: all tests PASS

- [ ] **Step 4: Commit test and implementation**

```bash
git add apps/backend/src/agent/tools/file/edit-file.test.ts
git commit -m "test(backend): add edit_file tool tests"

git add apps/backend/src/agent/tools/file/edit-file.ts
git commit -m "feat(backend): implement edit_file tool"
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

import {editFileTool} from './edit-file.js';
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
    instance.register(editFileTool);
    return instance;
  }
}
```

- [ ] **Step 2: Export from index.ts**

Update `index.ts`:

```typescript
export {editFileTool} from './edit-file.js';
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
git commit -m "feat(backend): register edit_file tool in FileToolRegistry"
```
