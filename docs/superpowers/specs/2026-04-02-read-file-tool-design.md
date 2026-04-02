# read_file Tool Design

## Overview

A file reading tool for the Agent system, enabling LLM to read files within the Agent's working directory. Part of the file operation tool set registered in `FileToolRegistry`.

## Tool Interface

**Name:** `read_file`

| Parameter   | Type     | Required | Description                                          |
| ----------- | -------- | -------- | ---------------------------------------------------- |
| `filePath`  | `string` | Yes      | File path, absolute or relative to working directory |
| `startLine` | `number` | No       | Start line number (1-based), defaults to 1           |
| `lineCount` | `number` | No       | Number of lines to read, defaults to end of file     |

## Constants

| Name                    | Value | Purpose                                         |
| ----------------------- | ----- | ----------------------------------------------- |
| Max return size         | 32KB  | Reject and return error if result exceeds       |
| Single file cache limit | 1MB   | Files larger than this are not cached           |
| Total cache size limit  | 10MB  | LRU eviction when total cached size exceeds     |
| Binary detection size   | 8KB   | Read first 8KB to check for null bytes (binary) |

## Execution Flow

1. Resolve path: `path.resolve(workingDirectory, filePath)` to get absolute path.
2. Security check: absolute path must start with `workingDirectory`. If not, return access denied error.
3. `fs.stat`: verify file exists and is a regular file. Get file size and mtime.
4. Binary check: read first 8KB of the file. If it contains a null byte (`0x00`), return error indicating the file is binary.
5. Check cache: if hit **and** cached mtime/size match current stat, extract requested line range from cached content, skip to step 9.
   If hit but mtime/size mismatch, invalidate the stale entry and continue to step 6.
6. File size decision:
   - \> 1MB: stream through the file to count total lines and extract only the requested line range. Do not cache.
   - \<= 1MB: read full content, store in cache with mtime and size (LRU eviction if total cache exceeds 10MB). Extract requested line range from content.
7. At this point we have: the extracted lines, the total line count.
8. Check if extracted result exceeds 32KB. If so, return error with total line count.
9. Format output with line numbers and metadata header. Return.

## Return Format

### Success (full file)

```
File: src/index.ts (25 lines)
    1	import {z} from 'zod';
    2
    3	export const foo = z.object({
...
```

### Success (partial read)

```
File: src/index.ts (150 lines, showing lines 50-70)
   50	  const result = await fetch(url);
   51	  return result.json();
   52	}
...
```

Line numbers are right-aligned and tab-separated, matching the real line numbers in the file.

### Errors

| Scenario            | Message                                                                                                               |
| ------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Path outside cwd    | `Error: Access denied: path is outside the working directory`                                                         |
| File not found      | `Error: File not found: <filePath>`                                                                                   |
| Not a file          | `Error: Not a file: <filePath>`                                                                                       |
| Binary file         | `Error: Binary file detected: <filePath>. Only text files are supported.`                                             |
| Result exceeds 32KB | `Error: Read result exceeds 32KB limit. File: <filePath> (<N> lines). Use startLine and lineCount to read a portion.` |
| Other I/O error     | `Error: <system error message>`                                                                                       |

All errors are returned as strings (not thrown), so the LLM can understand and adjust its strategy.

## Framework Changes

### ToolExecutionContext

Add two fields:

```typescript
interface ToolExecutionContext {
  // ... existing fields
  readonly workingDirectory: string;
  readonly fileCache: FileContentCache;
}
```

- `workingDirectory`: Agent's working directory, passed in at Agent construction time.
- `fileCache`: cache instance, owned by the Agent, injected into context on each tool execution.

### Agent

- Constructor accepts a new `workingDirectory` parameter from the caller (e.g., HTTP handler or session initializer).
- Creates a `FileContentCache` instance, held for the Agent's lifetime.
- `executeTool()` injects both `workingDirectory` and `fileCache` into `ToolExecutionContext`.

### Test helpers

- `createMockContext()` updated to include `workingDirectory` and `fileCache` defaults.

## FileContentCache

LRU cache for file contents, scoped to an Agent instance.

### Interface

```typescript
interface FileStats {
  mtimeMs: number;
  size: number;
}

class FileContentCache {
  get(absolutePath: string, currentStats: FileStats): string | undefined;
  set(absolutePath: string, content: string, stats: FileStats): void;
  invalidate(absolutePath: string): void;
}
```

### Internals

- Each cache entry stores: `{ content: string, mtimeMs: number, size: number }`.
- Backed by `Map<string, CacheEntry>` — insertion order provides LRU ordering.
- `get()`: if found, compare `mtimeMs` and `size` against `currentStats`. If mismatch, invalidate and return `undefined`. If valid, delete and re-insert to move to end (most recently used), return content.
- `set()`: if new entry would cause total size to exceed 10MB, evict from the front (least recently used) until enough space is available. If a single entry exceeds 10MB, do not cache it.
- `invalidate()`: remove the entry and update total size.
- Tracks `currentTotalSize` as a running sum of `Buffer.byteLength(content)` for each cached entry.

### Cache Invalidation

Write-file tool (future) calls `fileCache.invalidate(absolutePath)` after a successful write. No TTL — cache lives and dies with the Agent instance.

## File Structure

New files under `apps/backend/src/agent/tools/file/`:

```
file/
├── file-tool-registry.ts    # (existing) registers read_file tool
├── file-content-cache.ts    # FileContentCache class
├── file-content-cache.test.ts
├── read-file.ts             # read_file tool definition
├── read-file.test.ts
└── index.ts                 # barrel export
```

Framework changes in `apps/backend/src/agent-core/`:

```
agent-core/
├── tool/types.ts            # add workingDirectory, fileCache to ToolExecutionContext
├── tool/testing.ts          # update createMockContext
└── agent/agent.ts           # accept workingDirectory, create FileContentCache, inject into context
```
