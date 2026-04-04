# Write File Tool Design

## Overview

Add a `write_file` tool to the existing `FileToolRegistry`, allowing the Agent to create new files or overwrite existing ones.

## Tool Definition

- **name**: `write_file`
- **displayName**: `Write File`
- **description**: Creates a new file or overwrites an existing file. Prefer editing over overwriting when modifying existing files.

## Parameters

| Parameter  | Type     | Required | Description                                          |
| ---------- | -------- | -------- | ---------------------------------------------------- |
| `filePath` | `string` | Yes      | File path, absolute or relative to working directory |
| `content`  | `string` | Yes      | File content to write                                |

## Behavior

1. Resolve `filePath` to an absolute path.
2. Check content size: reject if exceeds 1MB (1,048,576 bytes).
3. Security check via `isSubPath`: path must be within workingDirectory or an extraAllowedPath with `read-write` mode.
   - Path outside all allowed directories: return access denied error.
   - Path within an extraAllowedPath with `read` mode: return read-only error.
4. Auto-create parent directories (`fs.mkdir` with `recursive: true`).
5. Write content to file (`fs.writeFile`, UTF-8 encoding).
6. Count lines and return success message.

## Output Format

Success:

```
File written: {filePath} ({lineCount} lines)
```

## File Changes

- **New**: `apps/backend/src/agent/tools/file/write-file.ts` — tool implementation
- **New**: `apps/backend/src/agent/tools/file/write-file.test.ts` — tests
- **Modify**: `apps/backend/src/agent/tools/file/file-tool-registry.ts` — register `writeFileTool`
- **Modify**: `apps/backend/src/agent/tools/file/index.ts` — export `writeFileTool`

## Error Cases

- Content exceeds 1MB: `"Error: Content exceeds 1MB limit"`
- Path outside allowed directories: `"Error: Access denied: path is outside the allowed directories"`
- Path within a read-only extraAllowedPath: `"Error: Access denied: path is read-only"`
- Write failure (IO error): `"Error: {message}"`
