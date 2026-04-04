# Edit File Tool Design

## Overview

Add an `edit_file` tool to the existing `FileToolRegistry`, allowing the Agent to make targeted string replacements in existing files and see the resulting diff.

## Tool Definition

- **name**: `edit_file`
- **displayName**: `Edit File`
- **description**: Replaces a specific string in a file. Requires the old string to uniquely match unless replaceAll is set.

## Parameters

| Parameter    | Type      | Required | Description                                                        |
| ------------ | --------- | -------- | ------------------------------------------------------------------ |
| `filePath`   | `string`  | Yes      | File path, absolute or relative to working directory               |
| `oldString`  | `string`  | Yes      | The string to find and replace                                     |
| `newString`  | `string`  | Yes      | The replacement string                                             |
| `replaceAll` | `boolean` | No       | Replace all occurrences. Defaults to false (requires unique match) |

## Behavior

1. Resolve `filePath` to an absolute path.
2. Security check via `isSubPath`: path must be within workingDirectory or an extraAllowedPath with `read-write` mode.
   - Path outside all allowed directories: return access denied error.
   - Path within an extraAllowedPath with `read` mode: return read-only error.
3. Read the file content. Reject if file exceeds 10MB.
4. Count occurrences of `oldString` in the content.
   - 0 occurrences: return "not found" error.
   - Multiple occurrences with `replaceAll` false: return error with match count.
   - 1 occurrence or `replaceAll` true: proceed with replacement.
5. Perform the replacement.
6. Write the updated content back to the file.
7. Generate a unified diff (using `diff` npm library) between old and new content.
8. Return success message with diff. If diff exceeds 4KB, truncate and return basic success message instead.

## Output Format

Success (diff within 4KB):

```
File edited: {filePath} ({count} replacement(s))
{unified diff}
```

Success (diff exceeds 4KB):

```
File edited: {filePath} ({count} replacement(s))
{first 4KB of unified diff}
... Diff truncated. Read the file to review the modified sections.
```

## File Changes

- **New**: `apps/backend/src/agent/tools/file/edit-file.ts` — tool implementation
- **New**: `apps/backend/src/agent/tools/file/edit-file.test.ts` — tests
- **Modify**: `apps/backend/src/agent/tools/file/file-tool-registry.ts` — register `editFileTool`
- **Modify**: `apps/backend/src/agent/tools/file/index.ts` — export `editFileTool`
- **New dependency**: `diff` in `apps/backend/package.json`

## Error Cases

- Path outside allowed directories: `"Error: Access denied: path is outside the allowed directories"`
- Path within a read-only extraAllowedPath: `"Error: Access denied: path is read-only"`
- File exceeds 10MB: `"Error: File exceeds {MAX_FILE_SIZE} byte limit"`
- File does not exist: `"Error: File not found: {filePath}"`
- Not a file: `"Error: Not a file: {filePath}"`
- oldString not found: `"Error: old string not found in {filePath}"`
- Multiple matches without replaceAll: `"Error: Found {count} matches in {filePath}. Provide more context to make a unique match, or set replaceAll to replace all occurrences."`
- Write failure: `"Error: {message}"`
