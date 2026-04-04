# Find Files Tool Design

## Overview

Add a `find_files` tool to the existing `FileToolRegistry`, allowing the Agent to search for files by glob pattern within the working directory.

## Tool Definition

- **name**: `find_files`
- **displayName**: `Find Files`
- **description**: Searches for files matching a glob pattern and returns their paths.

## Parameters

| Parameter | Type     | Required | Description                                                                |
| --------- | -------- | -------- | -------------------------------------------------------------------------- |
| `pattern` | `string` | Yes      | Glob pattern, e.g. `**/*.ts`, `src/{components,hooks}/**/*.ts`             |
| `path`    | `string` | No       | Search root directory (relative or absolute), defaults to workingDirectory |

## Behavior

1. Resolve `path` (default: workingDirectory) to an absolute path.
2. Security check via `isSubPath`: resolved path must be within workingDirectory or extraAllowedPaths.
3. Call `fast-glob` with:
   - `cwd`: resolved search directory
   - `onlyFiles: true`
   - `dot: true` (match dotfiles)
   - No `ignore` — the tool does not do any implicit filtering
4. Sort results alphabetically by path.
5. Cap at 100 results. If exceeded, truncate and append: `"Showing 100 of {total} results. Use a more specific pattern to narrow down."`
6. Return one relative path per line (relative to the search directory).

## Output Format

```
Found {count} files matching "{pattern}" in {path}:
path/to/file1.ts
path/to/file2.ts
...
```

When truncated:

```
Found 100 of {total} files matching "{pattern}" in {path} (truncated):
path/to/file1.ts
...
Showing 100 of {total} results. Use a more specific pattern to narrow down.
```

When no matches:

```
No files found matching "{pattern}" in {path}.
```

## File Changes

- **New**: `apps/backend/src/agent/tools/file/find-files.ts` — tool implementation
- **New**: `apps/backend/src/agent/tools/file/find-files.test.ts` — tests
- **Modify**: `apps/backend/src/agent/tools/file/file-tool-registry.ts` — register `findFilesTool`
- **Modify**: `apps/backend/src/agent/tools/file/index.ts` — export `findFilesTool`
- **New dependency**: `fast-glob` in `apps/backend/package.json`

## Error Cases

- Path outside allowed directories: `"Error: Access denied: path is outside the allowed directories"`
- Path does not exist: `"Error: Directory not found: {path}"`
- Path is not a directory: `"Error: Not a directory: {path}"`
- Invalid glob pattern (fast-glob throws): `"Error: Invalid pattern: {message}"`
