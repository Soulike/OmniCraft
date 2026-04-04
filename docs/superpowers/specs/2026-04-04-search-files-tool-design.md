# Search Files Tool Design

## Overview

Add a `search_files` tool to the existing `FileToolRegistry`, allowing the Agent to search file contents by regex pattern with concurrent file matching.

## Tool Definition

- **name**: `search_files`
- **displayName**: `Search Files`
- **description**: Searches file contents for a regex pattern and returns matching lines.

## Parameters

| Parameter     | Type     | Required | Description                                                                |
| ------------- | -------- | -------- | -------------------------------------------------------------------------- |
| `pattern`     | `string` | Yes      | Regex pattern to match against file contents                               |
| `path`        | `string` | No       | Search root directory (relative or absolute), defaults to workingDirectory |
| `filePattern` | `string` | No       | Glob pattern to filter files, e.g. `**/*.ts`, defaults to `**/*`           |

## Architecture

Two layers:

1. **`searchFile(filePath, regex, maxMatches, signal)`** — Async function. Reads a single file line-by-line with readline, returns an array of `{line: number, content: string}` matches. Stops when `maxMatches` is reached or `AbortSignal` fires.
2. **Tool `execute()`** — Uses fast-glob stream to enumerate files, dispatches `searchFile` calls concurrently (max 10 in flight), collects results up to the limit.

## Behavior

1. Resolve `path` (default: workingDirectory) to an absolute path.
2. Security check via `isSubPathOrSelf`: resolved path must be within workingDirectory or extraAllowedPaths.
3. Verify directory exists (stat check).
4. Compile `pattern` to a `RegExp`. Return error if invalid.
5. Use fast-glob stream with `filePattern` (default `**/*`), `onlyFiles: true`, `dot: true`.
6. For each file from the stream:
   - Skip binary files (reuse `isBinaryFile` from helpers).
   - Call `searchFile(absolutePath, regex, remainingQuota, signal)` concurrently (max 10 in-flight). `remainingQuota` is the number of matches still allowed before hitting the global cap.
7. `searchFile` reads line-by-line with readline. For each matching line, record `{line, content}`. Stops when `maxMatches` is reached or `AbortSignal` fires, returning collected matches.
8. Collect matches across all files. Cap at 100 total matching lines. When reached, abort all in-flight searches and stop enumerating files.
9. 30s timeout (timestamp-based). When exceeded, abort all in-flight searches and return collected results with a warning.
10. Sort results by file path, then by line number.

## Output Format

Normal:

```
Found {count} matches for /{pattern}/ in {path}:
src/foo.ts:12: const result = doSomething();
src/foo.ts:45: doSomething(arg);
src/bar.ts:3: import {doSomething} from './foo';
```

Truncated (100 match limit):

```
Found 100+ matches for /{pattern}/ in {path} (showing first 100):
...
Use a more specific pattern to narrow down.
```

Timed out:

```
Found {count} matches for /{pattern}/ in {path} (search timed out after 30s):
...
Results may be incomplete. Use a more specific pattern to narrow down.
```

No matches:

```
No matches found for /{pattern}/ in {path}.
```

## File Changes

- **New**: `apps/backend/src/agent/tools/file/search-files.ts` — tool implementation + `searchFile` function
- **New**: `apps/backend/src/agent/tools/file/search-files.test.ts` — tests
- **Modify**: `apps/backend/src/agent/tools/file/file-tool-registry.ts` — register `searchFilesTool`
- **Modify**: `apps/backend/src/agent/tools/file/index.ts` — export `searchFilesTool`

## Error Cases

- Path outside allowed directories: `"Error: Access denied: path is outside the allowed directories"`
- Path does not exist: `"Error: Directory not found: {path}"`
- Path is not a directory: `"Error: Not a directory: {path}"`
- Invalid regex pattern: `"Error: Invalid regex pattern: {message}"`
- fast-glob or IO error: `"Error: {message}"`
