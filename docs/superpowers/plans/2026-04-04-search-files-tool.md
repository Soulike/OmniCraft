# Search Files Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `search_files` tool to the Agent's FileToolRegistry that searches file contents by regex pattern with concurrent file matching.

**Architecture:** Two-layer design: `searchFile()` handles single-file line-by-line matching with AbortSignal + maxMatches support; tool `execute()` uses fast-glob stream to enumerate files and dispatches concurrent `searchFile()` calls. Follows existing patterns from `find_files`.

**Tech Stack:** TypeScript, fast-glob (already installed), Node.js readline/createReadStream, Zod, Vitest

**Spec:** `docs/superpowers/specs/2026-04-04-search-files-tool-design.md`

---

### Task 1: Write tests for searchFile helper function

**Files:**

- Create: `apps/backend/src/agent/tools/file/search-files.test.ts`

- [ ] **Step 1: Write searchFile tests**

```typescript
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {searchFile} from './search-files.js';

describe('searchFile', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-test-'));
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

  it('finds matching lines with line numbers', async () => {
    const filePath = await writeFile('test.ts', 'foo\nbar\nbaz\nfoo bar\n');

    const matches = await searchFile(filePath, /foo/, 100);

    expect(matches).toEqual([
      {line: 1, content: 'foo'},
      {line: 4, content: 'foo bar'},
    ]);
  });

  it('returns empty array when no matches', async () => {
    const filePath = await writeFile('test.ts', 'hello\nworld\n');

    const matches = await searchFile(filePath, /xyz/, 100);

    expect(matches).toEqual([]);
  });

  it('respects maxMatches limit', async () => {
    const filePath = await writeFile(
      'test.ts',
      'match1\nmatch2\nmatch3\nmatch4\nmatch5\n',
    );

    const matches = await searchFile(filePath, /match/, 3);

    expect(matches).toHaveLength(3);
    expect(matches[0]).toEqual({line: 1, content: 'match1'});
    expect(matches[2]).toEqual({line: 3, content: 'match3'});
  });

  it('stops reading when AbortSignal fires', async () => {
    const lines = Array.from({length: 1000}, (_, i) => `line${i}`).join('\n');
    const filePath = await writeFile('big.ts', lines);

    const controller = new AbortController();
    controller.abort();

    const matches = await searchFile(filePath, /line/, 100, controller.signal);

    expect(matches.length).toBeLessThan(1000);
  });

  it('supports regex special characters', async () => {
    const filePath = await writeFile('test.ts', 'foo(bar)\nfoo[baz]\nplain\n');

    const matches = await searchFile(filePath, /foo\(bar\)/, 100);

    expect(matches).toEqual([{line: 1, content: 'foo(bar)'}]);
  });

  it('handles empty file', async () => {
    const filePath = await writeFile('empty.ts', '');

    const matches = await searchFile(filePath, /anything/, 100);

    expect(matches).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/backend && bun run test -- src/agent/tools/file/search-files.test.ts
```

Expected: FAIL (cannot resolve `./search-files.js`)

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/agent/tools/file/search-files.test.ts
git commit -m "test(backend): add searchFile helper tests"
```

---

### Task 2: Implement searchFile helper and stub the tool

**Files:**

- Create: `apps/backend/src/agent/tools/file/search-files.ts`

- [ ] **Step 1: Write the implementation**

```typescript
import assert from 'node:assert';
import {createReadStream} from 'node:fs';
import type {Stats} from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';

import fg from 'fast-glob';
import {z} from 'zod';

import type {
  ToolDefinition,
  ToolExecutionContext,
} from '@/agent-core/tool/index.js';

import {isBinaryFile, isSubPathOrSelf} from './helpers.js';

const MAX_MATCHES = 100;
const MAX_CONCURRENCY = 10;
const TIMEOUT_MS = 30_000;

/** A single matching line from a file search. */
export interface FileMatch {
  readonly line: number;
  readonly content: string;
}

/** A group of matches from a single file. */
interface FileSearchResult {
  readonly filePath: string;
  readonly matches: readonly FileMatch[];
}

/**
 * Searches a single file line-by-line for regex matches.
 * Stops when maxMatches is reached or the AbortSignal fires.
 */
export async function searchFile(
  absolutePath: string,
  regex: RegExp,
  maxMatches: number,
  signal?: AbortSignal,
): Promise<FileMatch[]> {
  const matches: FileMatch[] = [];

  const rl = readline.createInterface({
    input: createReadStream(absolutePath, {encoding: 'utf-8'}),
    crlfDelay: Infinity,
  });

  let lineNumber = 0;
  for await (const line of rl) {
    if (signal?.aborted) break;
    lineNumber++;
    if (regex.test(line)) {
      matches.push({line: lineNumber, content: line});
      if (matches.length >= maxMatches) break;
    }
  }

  rl.close();
  return matches;
}

const parameters = z.object({
  pattern: z
    .string()
    .min(1)
    .describe(
      'Pattern string compiled to a JavaScript RegExp and matched with .test() per line',
    ),
  path: z
    .string()
    .optional()
    .describe(
      'Search root directory (relative or absolute), defaults to working directory',
    ),
  filePattern: z
    .string()
    .optional()
    .describe(
      'Glob pattern to filter files, e.g. "**/*.ts", defaults to "**/*"',
    ),
});

type SearchFilesArgs = z.infer<typeof parameters>;

/** Built-in tool that searches file contents for a regex pattern. */
export const searchFilesTool: ToolDefinition<typeof parameters> = {
  name: 'search_files',
  displayName: 'Search Files',
  description:
    'Searches file contents for a regex pattern and returns matching lines.',
  parameters,
  async execute(
    args: SearchFilesArgs,
    context: ToolExecutionContext,
  ): Promise<string> {
    const {workingDirectory} = context;

    // 1. Resolve search directory
    const searchDir = path.resolve(workingDirectory, args.path ?? '.');

    // 2. Security check
    if (!isSubPathOrSelf(workingDirectory, searchDir)) {
      const allowed = context.extraAllowedPaths.some((entry) =>
        isSubPathOrSelf(entry.path, searchDir),
      );
      if (!allowed) {
        return 'Error: Access denied: path is outside the allowed directories';
      }
    }

    // 3. Verify directory exists
    let stat: Stats;
    try {
      stat = await fs.stat(searchDir);
    } catch {
      return `Error: Directory not found: ${args.path}`;
    }

    if (!stat.isDirectory()) {
      return `Error: Not a directory: ${args.path}`;
    }

    // 4. Compile regex
    let regex: RegExp;
    try {
      regex = new RegExp(args.pattern);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return `Error: Invalid regex pattern: ${message}`;
    }

    // 5. Enumerate files and search concurrently
    const stream = fg.stream(args.filePattern ?? '**/*', {
      cwd: searchDir,
      onlyFiles: true,
      dot: true,
    });

    const results: FileSearchResult[] = [];
    let totalMatches = 0;
    let timedOut = false;
    const startTime = Date.now();
    const controller = new AbortController();

    const inFlight = new Set<Promise<void>>();

    try {
      for await (const entry of stream) {
        if (totalMatches >= MAX_MATCHES) break;
        if (Date.now() - startTime > TIMEOUT_MS) {
          timedOut = true;
          break;
        }

        assert(typeof entry === 'string');
        const absolutePath = path.join(searchDir, entry);
        const relativePath = entry;

        const task = (async () => {
          try {
            if (await isBinaryFile(absolutePath)) return;
          } catch {
            return;
          }

          const remaining = MAX_MATCHES - totalMatches;
          if (remaining <= 0) return;

          const matches = await searchFile(
            absolutePath,
            regex,
            remaining,
            controller.signal,
          );

          if (matches.length > 0) {
            results.push({filePath: relativePath, matches});
            totalMatches += matches.length;
            if (totalMatches >= MAX_MATCHES) {
              controller.abort();
            }
          }
        })();

        inFlight.add(task);
        task.finally(() => inFlight.delete(task));

        while (inFlight.size >= MAX_CONCURRENCY) {
          await Promise.race(inFlight);
        }
      }
    } catch (error: unknown) {
      if (totalMatches === 0) {
        const message = error instanceof Error ? error.message : String(error);
        return `Error: ${message}`;
      }
    }

    // Wait for remaining in-flight searches
    await Promise.allSettled(inFlight);

    // Check timeout after waiting
    if (!timedOut && Date.now() - startTime > TIMEOUT_MS) {
      timedOut = true;
    }

    // 6. Sort by file path, then line number
    results.sort((a, b) => a.filePath.localeCompare(b.filePath));

    // 7. Format output
    const displayPath = args.path ?? workingDirectory;
    const hitLimit = totalMatches >= MAX_MATCHES;

    if (totalMatches === 0 && timedOut) {
      return `No matches found for /${args.pattern}/ in ${displayPath} (search timed out after 30s).`;
    }

    if (totalMatches === 0) {
      return `No matches found for /${args.pattern}/ in ${displayPath}.`;
    }

    const lines: string[] = [];
    let count = 0;
    for (const result of results) {
      for (const match of result.matches) {
        if (count >= MAX_MATCHES) break;
        lines.push(`${result.filePath}:${match.line}: ${match.content}`);
        count++;
      }
      if (count >= MAX_MATCHES) break;
    }

    const body = lines.join('\n');

    if (timedOut) {
      const header = `Found ${count} matches for /${args.pattern}/ in ${displayPath} (search timed out after 30s):`;
      return `${header}\n${body}\nResults may be incomplete. Use a more specific pattern to narrow down.`;
    }

    if (hitLimit) {
      const header = `Found ${MAX_MATCHES}+ matches for /${args.pattern}/ in ${displayPath} (showing first ${MAX_MATCHES}):`;
      return `${header}\n${body}\nUse a more specific pattern to narrow down.`;
    }

    const header = `Found ${count} matches for /${args.pattern}/ in ${displayPath}:`;
    return `${header}\n${body}`;
  },
};
```

- [ ] **Step 2: Run searchFile tests to verify they pass**

```bash
cd apps/backend && bun run test -- src/agent/tools/file/search-files.test.ts
```

Expected: all searchFile tests PASS

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/agent/tools/file/search-files.ts
git commit -m "feat(backend): implement searchFile helper and search_files tool"
```

---

### Task 3: Write tests for search_files tool execute()

**Files:**

- Modify: `apps/backend/src/agent/tools/file/search-files.test.ts`

- [ ] **Step 1: Add tool-level tests**

Append the following `describe` block to the existing test file, after the `searchFile` describe block:

```typescript
import {vi} from 'vitest';

import {FileContentCache} from '@/agent-core/agent/index.js';
import {createMockContext} from '@/agent-core/tool/testing.js';
import type {ToolExecutionContext} from '@/agent-core/tool/types.js';

import {searchFilesTool} from './search-files.js';

describe('searchFilesTool', () => {
  let tmpDir: string;
  let context: ToolExecutionContext;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sft-test-'));
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
    expect(searchFilesTool.name).toBe('search_files');
  });

  describe('success cases', () => {
    it('finds matches across multiple files', async () => {
      await writeFile('a.ts', 'import foo\nexport bar\n');
      await writeFile('b.ts', 'import baz\nconst x = 1\n');

      const result = await searchFilesTool.execute(
        {pattern: 'import'},
        context,
      );

      expect(result).toContain('Found 2 matches');
      expect(result).toContain('a.ts:1: import foo');
      expect(result).toContain('b.ts:1: import baz');
    });

    it('filters by filePattern', async () => {
      await writeFile('a.ts', 'hello world\n');
      await writeFile('b.js', 'hello world\n');

      const result = await searchFilesTool.execute(
        {pattern: 'hello', filePattern: '**/*.ts'},
        context,
      );

      expect(result).toContain('a.ts');
      expect(result).not.toContain('b.js');
    });

    it('searches within a custom path', async () => {
      await writeFile('src/a.ts', 'target\n');
      await writeFile('lib/b.ts', 'target\n');

      const result = await searchFilesTool.execute(
        {pattern: 'target', path: 'src'},
        context,
      );

      expect(result).toContain('a.ts');
      expect(result).not.toContain('b.ts');
    });

    it('returns no-match message when nothing found', async () => {
      await writeFile('a.ts', 'hello\n');

      const result = await searchFilesTool.execute({pattern: 'xyz'}, context);

      expect(result).toContain('No matches found');
    });

    it('skips binary files', async () => {
      await writeFile('text.ts', 'match\n');
      const binaryPath = path.join(tmpDir, 'binary.bin');
      const buf = Buffer.alloc(100);
      buf.fill(0x41, 0, 50);
      buf[50] = 0x00;
      buf.fill(0x41, 51);
      await fs.writeFile(binaryPath, buf);

      const result = await searchFilesTool.execute({pattern: 'A'}, context);

      expect(result).toContain('text.ts');
      expect(result).not.toContain('binary.bin');
    });

    it('sorts results by file path', async () => {
      await writeFile('c.ts', 'match\n');
      await writeFile('a.ts', 'match\n');
      await writeFile('b.ts', 'match\n');

      const result = await searchFilesTool.execute({pattern: 'match'}, context);

      const lines = result.split('\n').filter((l) => l.includes(':'));
      expect(lines[0]).toContain('a.ts');
      expect(lines[1]).toContain('b.ts');
      expect(lines[2]).toContain('c.ts');
    });

    it('truncates at 100 matches', async () => {
      const content = Array.from({length: 20}, (_, i) => `match${i}`).join(
        '\n',
      );
      const writes = Array.from({length: 10}, (_, i) =>
        writeFile(`file${i}.ts`, content),
      );
      await Promise.all(writes);

      const result = await searchFilesTool.execute({pattern: 'match'}, context);

      expect(result).toContain('100+');
      expect(result).toContain('showing first 100');
    });

    it('returns partial results on timeout', async () => {
      await writeFile('a.ts', 'match\n');

      let callCount = 0;
      vi.spyOn(Date, 'now').mockImplementation(() => {
        callCount++;
        if (callCount <= 1) return 0;
        return 31_000;
      });

      const result = await searchFilesTool.execute({pattern: 'match'}, context);

      vi.restoreAllMocks();

      expect(result).toContain('timed out after 30s');
    });
  });

  describe('error cases', () => {
    it('rejects path outside workingDirectory', async () => {
      const result = await searchFilesTool.execute(
        {pattern: 'test', path: '/etc'},
        context,
      );

      expect(result).toContain('Error: Access denied');
    });

    it('returns error for nonexistent directory', async () => {
      const result = await searchFilesTool.execute(
        {pattern: 'test', path: 'nonexistent'},
        context,
      );

      expect(result).toContain('Error: Directory not found');
    });

    it('returns error for invalid regex', async () => {
      await writeFile('a.ts', 'hello\n');

      const result = await searchFilesTool.execute(
        {pattern: '[invalid'},
        context,
      );

      expect(result).toContain('Error: Invalid regex pattern');
    });

    it('returns error when path is a file', async () => {
      await writeFile('afile.txt', 'content');

      const result = await searchFilesTool.execute(
        {pattern: 'test', path: 'afile.txt'},
        context,
      );

      expect(result).toContain('Error: Not a directory');
    });
  });
});
```

Note: The imports (`vi`, `FileContentCache`, `createMockContext`, `ToolExecutionContext`, `searchFilesTool`) must be added at the top of the file alongside the existing imports. The `fs`, `os`, `path`, `beforeEach`, `afterEach`, `describe`, `expect`, `it` imports are already present from Task 1.

- [ ] **Step 2: Run all tests**

```bash
cd apps/backend && bun run test -- src/agent/tools/file/search-files.test.ts
```

Expected: all tests PASS

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/agent/tools/file/search-files.test.ts
git commit -m "test(backend): add search_files tool tests"
```

---

### Task 4: Register and export the tool

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

/** Registry for file-operation tools. */
export class FileToolRegistry extends ToolRegistry {
  /** Creates the singleton and registers all file tools. */
  static override create(): FileToolRegistry {
    const instance = super.create() as FileToolRegistry;
    instance.register(readFileTool);
    instance.register(findFilesTool);
    instance.register(searchFilesTool);
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
```

- [ ] **Step 3: Run all tests and typecheck**

```bash
cd apps/backend && bun run test && bun run typecheck
```

Expected: all tests PASS, no type errors

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/agent/tools/file/file-tool-registry.ts apps/backend/src/agent/tools/file/index.ts
git commit -m "feat(backend): register search_files tool in FileToolRegistry"
```
