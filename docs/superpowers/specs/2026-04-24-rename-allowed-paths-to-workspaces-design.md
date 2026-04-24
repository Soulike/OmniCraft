# Rename `allowedPaths` to `workspaces`

## Background

The earlier `simplify-path-access` work removed `extraAllowedPaths` from the business code (service layer, file tools, coding session creation). The settings layer still exposes the old model: `settings.fileAccess.allowedPaths: Array<{path, mode: 'read' | 'read-write'}>`.

The `mode` field no longer has any real effect:

- File tools no longer consult `allowedPaths` for authorization.
- The only remaining use is session creation, which requires `mode === 'read-write'` — so `mode: 'read'` entries are dead data.

This spec renames the concept to **Workspaces** and removes the `mode` / access-permission model entirely. A workspace is simply a directory the user has registered for the agent to work in.

No backward compatibility: existing `fileAccess.allowedPaths` data in `~/.omnicraft/settings.json` will be silently dropped on load (Zod non-strict parse ignores unknown keys). Users will need to re-add their workspaces.

## Final shape

### Settings schema

```ts
// packages/settings-schema/src/file-access/schema.ts
export const workspaceSchema = z.object({
  path: z.string().describe('Absolute directory path'),
});
export type Workspace = z.infer<typeof workspaceSchema>;

export const fileAccessSettingsSchema = z.object({
  workspaces: z
    .array(workspaceSchema)
    .describe('Configured workspaces')
    .default([]),
});
```

Deleted: `accessModeSchema`, `allowedPathEntrySchema`, `AllowedPathEntry`.

The `fileAccess` namespace on the root settings object is retained so future path-related settings can live alongside `workspaces`.

### HTTP API

- Route: `/settings/file-access/workspaces` (replaces `/settings/file-access/allowed-paths`)
- GET response: `{workspaces: Workspace[]}`
- PUT request: `{workspaces: Workspace[]}`
- PUT success: `{success: true}`
- PUT 422 error: `{error: 'INVALID_PATHS', invalidPaths: InvalidPathEntry[]}`

`InvalidPathEntry` is retained as-is — it still communicates per-path validation failures.

### Validation

`normalizeAndValidatePaths` validates every workspace with `R_OK | W_OK` (read-write required). `PathValidationError` enum:

- Keeps: `NOT_ABSOLUTE`, `DUPLICATE`, `NOT_FOUND`, `NOT_DIRECTORY`
- Removes: `NOT_READABLE`, `NOT_READABLE_AND_WRITABLE`
- Adds: `NOT_ACCESSIBLE` (used whenever the filesystem access check fails)

### Session creation

`validateSessionPaths(workspace, workspaces)` checks:

1. Workspace string matches some `workspaces[i].path`. On miss → `CreateSessionError.WORKSPACE_NOT_CONFIGURED`.
2. Filesystem check (`R_OK | W_OK`, directory exists, is a directory) — existing errors retained.

Removed: `WORKSPACE_NOT_READ_WRITE` (and the mode branch). Renamed: `WORKSPACE_NOT_IN_ALLOWED_PATHS` → `WORKSPACE_NOT_CONFIGURED`.

### UI

**Settings section** (`apps/frontend/src/pages/settings/sections/file-access/`):

- Directory name retained (matches the `fileAccess` settings namespace).
- Component files retained (`FileAccessSection.tsx`, `FileAccessSectionView.tsx`).
- Section title `File Access` retained — stays aligned with the `fileAccess` namespace and directory name.
- `tmpdir` is-always-accessible `<Alert>` is removed — it only made sense under the old permission model.
- `PathList`: remove the mode `<Chip>`; empty state `No workspaces configured yet.`; aria-label `Workspaces`.
- `AddPathForm`: remove the mode `<Select>`, `newMode` state, `onModeChange`.
- Hook `useAllowedPaths.ts` renamed to `useWorkspaces.ts`; internal state `paths` renamed to `workspaces`.

**Session setup**:

- `SessionConfigContext`: `allAllowedPathEntriesFromSettings: AllowedPathEntry[]` → `workspaces: Workspace[]`.
- `useWorkspaceSelect`: remove the `readWritePaths` filter — every workspace is selectable.
- `WorkspaceSelectView`: props `readWritePaths` → `workspaces`; tooltip `Read-write directory the agent works in` → `Directory the agent works in`.
- `SessionSetup`: empty-state text `No allowed paths configured` → `No workspaces configured`.

## Non-goals

- No settings migration. Old `allowedPaths` entries are dropped on load.
- No directory or filename renames (e.g., `file-access-settings/` stays).
- No updates to historical specs/plans under `docs/superpowers/`.
- No change to the session-level `workspace` concept — it continues to be a single directory chosen at session creation time.

## Testing

- `apps/backend/src/services/file-access-settings/helpers.test.ts`: drop cases that distinguish `read` vs `read-write`; retain coverage for absolute/relative, duplicate, normalize, not-found, not-directory, and not-accessible outcomes.
- `apps/backend/src/services/agent-session/validation.test.ts`: drop cases tied to `mode !== 'read-write'`; update to the `WORKSPACE_NOT_CONFIGURED` error name.
- `packages/settings-schema/src/schema.test.ts`: update any structural assertions.

## Rollout

Single atomic PR spanning `packages/settings-schema`, `packages/api-schema`, `apps/backend`, `apps/frontend`. Since backward compatibility is explicitly out of scope, no intermediate state is meaningful.
