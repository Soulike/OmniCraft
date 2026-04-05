# Workspace & Allowed Paths Configuration

## Overview

Allow users to configure accessible file paths in settings, then select a workspace and extra allowed paths per chat session. Currently, the workspace is hardcoded to `os.tmpdir()` and extra allowed paths are empty.

## Settings Schema

New `fileAccess` section in `settings-schema`, sibling to `llm`, `agent`, `search`:

```ts
// packages/settings-schema/src/file-access/schema.ts
const accessMode = z
  .enum(['read', 'read-write'])
  .describe('Access mode for the path');

const allowedPathEntry = z.object({
  path: z.string().describe('Absolute directory path'),
  mode: accessMode,
});

export const fileAccessSettingsSchema = z.object({
  allowedPaths: z
    .array(allowedPathEntry)
    .describe('User-configured accessible paths')
    .default([]),
});
```

Root schema: `{ llm, agent, search, fileAccess }`.

Stored in `~/.omni-craft/settings.json`. The system temp directory (`os.tmpdir()`) is always implicitly allowed with read-write — not stored in settings.

### Type unification

The `AllowedPath` interface currently defined in `agent-core/tool/types.ts` (`{ path: string; mode: 'read' | 'read-write' }`) has the same shape as the Zod schema's `allowedPathEntry`. Remove the hand-written interface and replace it with the Zod-inferred type from `settings-schema`:

```ts
// Export from settings-schema
export type AllowedPathEntry = z.infer<typeof allowedPathEntry>;
// { path: string; mode: 'read' | 'read-write' }
```

All usages of the old `AllowedPath` interface in `agent-core` and `agent` (agent options, tool execution context, `checkAccess`, file tools) are updated to import from `@omnicraft/settings-schema` instead. This makes `settings-schema` the single source of truth for this type, shared across frontend and backend.

## Settings UI — File Access Tab

New tab at `/settings/file-access` in the settings page.

**Contents:**

- List of existing path entries, each showing the path (monospace) and mode badge (read / read-write), with a remove button.
- Add row: text input for the absolute path + mode dropdown (read / read-write) + Add button.
- Info note: "The system temporary directory is always accessible with read-write permission."
- Save button.

**Validation (on save):** Backend validates every path in the array:

- Must be an absolute path.
- Must exist on the filesystem.
- Must be a directory (not a file).

Returns per-path errors so the UI can indicate which entries are invalid.

Follows existing settings section patterns (`SettingSection` component, `useSettingValues`/`useSettingSave` hooks). However, since the allowed paths field is an array of objects (not a scalar), the existing scalar-oriented settings API (`GET/PUT /settings/:path`) is insufficient. The `PUT /settings/batch` endpoint can handle this since it writes arbitrary key-value pairs. The settings UI for this section will manage the array as a single value, reading via `GET /settings/fileAccess.allowedPaths` and writing via batch.

## Backend Validation

Two validation points:

### 1. Settings save

When `fileAccess.allowedPaths` is saved, the Zod schema validates structure (array of `{path, mode}`). After schema validation passes, a custom validation step in the settings service checks each entry against the filesystem:

- Path is absolute.
- Path exists on the filesystem.
- Path is a directory.

On failure, return an error response with per-path details:

```ts
{
  success: false;
  error: 'INVALID_PATHS';
  invalidPaths: Array<{index: number; path: string; reason: string}>;
}
```

This catches typos and misconfiguration at settings time.

### 2. Session creation

When `POST /chat/session` is called with workspace and extra paths:

- Workspace must be an absolute path, must exist, must be a directory.
- Workspace must appear in `fileAccess.allowedPaths` with `read-write` mode.
- Each extra allowed path must appear in `fileAccess.allowedPaths`.
- All referenced paths must still exist on the filesystem.

This catches paths that were valid at settings time but have since been removed/unmounted.

New error types in `CreateSessionError`:

- `WORKSPACE_NOT_CONFIGURED` — no workspace provided.
- `WORKSPACE_PATH_NOT_FOUND` — workspace path no longer exists.
- `WORKSPACE_NOT_IN_ALLOWED_PATHS` — workspace path not in settings or not read-write.
- `EXTRA_PATH_NOT_FOUND` — an extra allowed path no longer exists.
- `EXTRA_PATH_NOT_IN_ALLOWED_PATHS` — an extra path not in settings.

## Session Creation API

**Current:** `POST /chat/session` — no body.

**New:** `POST /chat/session` — requires body:

```ts
{
  workspace: string;           // absolute path, must be rw in settings
  extraAllowedPaths: string[]; // absolute paths, must be in settings
}
```

Response shape unchanged: `{ success, sessionId }` or `{ success, error }` with the new error types above.

The `CoreAgent` constructor receives `extraAllowedPaths` instead of hardcoding `[]`. The `chatService.createSession()` method accepts `workspace` and `extraAllowedPaths`, validates them, and passes through to `CoreAgent`.

## Chat Page — Config Bar

An inline configuration bar above the input area. Visible before the session is created. Contains:

- **Workspace** dropdown (single select) — populated from `fileAccess.allowedPaths` filtered to `read-write` entries only.
- **Extra Allowed Paths** dropdown (multi-select) — populated from all `fileAccess.allowedPaths` entries.
- Disclaimer text: "Agent may still access files outside these paths via shell when explicitly requested."

### States

**No workspace selected:** Input is disabled. An error-style warning appears above the input (same style as session creation errors): "Select a workspace to start chatting".

**Workspace selected, no session yet:** Input is enabled. User can type and send. On first Send:

1. `POST /chat/session` with `{ workspace, extraAllowedPaths }`.
2. On success, transition to session-active state.
3. On failure, show error inline in the config bar (same error style), re-disable input.

**Session active:** Config bar is replaced by an **InfoBar** component just above the input. The InfoBar merges access info and token usage into a single bar, matching the existing `UsageBar` styling (CSS Modules, same font size, same layout feel — no distinct background or visual treatment beyond what the current token info already has):

- **Left side:** workspace path. If extra paths were selected, show "N paths" with a tooltip listing each path and its mode on hover. If no extra paths, omit entirely.
- **Right side:** token usage info (input, output, cached) — same data currently in `UsageBar`.

The InfoBar effectively replaces the current `UsageBar`, extending it with access info on the left.

**Session creation error:** Error-style message displayed above the input (e.g., "Workspace path does not exist: /path"). Config bar remains editable so the user can fix the selection and retry.

## Component Changes

### New components

- `InfoBar` — replaces `UsageBar`. Displays workspace + extra paths (left) and token usage (right). Positioned just above the input, same location and styling approach as current `UsageBar` (CSS Modules).
- `SessionConfigBar` — config bar with workspace dropdown, extra paths multi-select, disclaimer. Shown before session creation.
- Settings section component for the File Access tab (follows existing `SettingSection` patterns).

### Modified components

- `ChatPageView` — renders `SessionConfigBar` before session, `InfoBar` after. Passes session config state down.
- `ChatPage` / `useSession` hook — updated to pass workspace and extra paths to session creation API.
- `UsageBar` — removed, functionality absorbed into `InfoBar`.

### Backend changes

- `settings-schema`: new `fileAccess` section. Export `AllowedPathEntry` type, replacing the hand-written `AllowedPath` interface in `agent-core/tool/types.ts`.
- `agent-core`: remove `AllowedPath` interface from `tool/types.ts`. Update all imports (`AgentOptions`, `ToolExecutionContext`, `checkAccess`, file tools) to use `AllowedPathEntry` from `@omnicraft/settings-schema`.
- `chat-service.ts`: `createSession()` accepts `workspace` and `extraAllowedPaths`, validates them.
- `core-agent.ts`: constructor accepts and passes through `extraAllowedPaths`.
- `chat/router.ts`: parses request body for session creation.
- New validation helpers for path existence/directory checks.
