# File Stat Tracker Design

## Overview

Add a `FileStatTracker` to prevent blind or stale file modifications. The tracker records known file stats (size + mtimeMs) after reads and writes, and validates them before modifications.

## Data Structure

### FileStatTracker

Location: `apps/backend/src/agent-core/agent/file-stat-tracker.ts`

```typescript
enum FileStatCheckResult {
  OK = 'ok',
  NOT_READ = 'not_read',
  MODIFIED_SINCE_LAST_READ = 'modified_since_last_read',
}

class FileStatTracker {
  /** Record or update the known stat for a file. */
  set(absolutePath: string, size: number, mtimeMs: number): void;

  /**
   * Check if the file can be safely modified.
   * Returns OK if the file was previously read and hasn't changed since.
   * Returns NOT_READ if the file has never been read.
   * Returns MODIFIED_SINCE_LAST_READ if the file changed since last read.
   * Clears the record on NOT_READ and MODIFIED_SINCE_LAST_READ.
   */
  canModify(
    absolutePath: string,
    currentSize: number,
    currentMtimeMs: number,
  ): FileStatCheckResult;

  /** Remove the record for a file. */
  delete(absolutePath: string): void;
}
```

Internal implementation: a `Map<string, {size: number, mtimeMs: number}>`.

## Integration

### ToolExecutionContext

Add `readonly fileStatTracker: FileStatTracker` to the `ToolExecutionContext` interface.

### read_file

After successful read, call `fileStatTracker.set(absolutePath, stat.size, stat.mtimeMs)`.

### write_file

- **New file** (file does not exist): no `canModify` check needed. After write, call `set` with the new file's stat.
- **Overwrite existing file**: call `canModify(absolutePath, stat.size, stat.mtimeMs)` before writing.
  - `OK`: proceed with write, then `set` with new stat.
  - `NOT_READ`: return `"Error: Read the file before modifying it"`.
  - `MODIFIED_SINCE_LAST_READ`: return `"Error: File has been modified since last read. Read the file again before modifying it"`.

### edit_file

Already has `stat` from the file existence check. Call `canModify` before editing.

- `OK`: proceed with edit, then `set` with new stat.
- `NOT_READ`: return `"Error: Read the file before modifying it"`.
- `MODIFIED_SINCE_LAST_READ`: return `"Error: File has been modified since last read. Read the file again before modifying it"`.

## File Changes

- **New**: `apps/backend/src/agent-core/agent/file-stat-tracker.ts` — FileStatTracker class + FileStatCheckResult enum
- **New**: `apps/backend/src/agent-core/agent/file-stat-tracker.test.ts` — unit tests
- **Modify**: `apps/backend/src/agent-core/agent/index.ts` — export FileStatTracker and FileStatCheckResult
- **Modify**: `apps/backend/src/agent-core/tool/types.ts` — add fileStatTracker to ToolExecutionContext
- **Modify**: `apps/backend/src/agent-core/tool/testing.ts` — include fileStatTracker in createMockContext
- **Modify**: `apps/backend/src/agent/tools/file/read-file.ts` — call set after read
- **Modify**: `apps/backend/src/agent/tools/file/write-file.ts` — call canModify before overwrite, set after write
- **Modify**: `apps/backend/src/agent/tools/file/edit-file.ts` — call canModify before edit, set after write
- **Modify**: `apps/backend/src/agent/agents/core-agent/core-agent.ts` — pass FileStatTracker instance to context
