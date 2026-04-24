# Simplify Path Access — Design

## Background

PR #190 removed `extraAllowedPaths` from the frontend and the coding-session
request body. The service layer and everything below still accept and
propagate the field, and file tools still perform `checkAccess` against a
workingDirectory + extraAllowedPaths allow-list.

The access control never was a real security boundary — the backend runs as
the user's local process, and bash commands can bypass any in-process check.
The allow-list mostly added code and concept weight.

This spec drops `extraAllowedPaths` end-to-end from the business layer and
simplifies the permission model: path-based read/write checks are removed
from file tools. `workingDirectory` is retained but narrowed to two
responsibilities — (1) base for relative-path resolution in file tools,
(2) default cwd for the bash tool.

Settings-layer code (allowedPaths in settings, the settings UI, the settings
schema) is explicitly out of scope and untouched.

## Goals

- Remove `extraAllowedPaths` from service → agent → agent-core → tool layer.
- Remove path-based read/write permission checks from file tools.
- Keep bash's "reset cwd to workingDirectory when it drifts outside" behavior.
- Keep workspace existence/accessibility validation at the service layer.

## Non-Goals

- Settings (`settings.fileAccess.allowedPaths`, settings UI) stay as-is.
- No snapshot migration; zod's default non-strict parse ignores extra keys.
- No changes to bash's existing sandboxing or cwd-drift reset.

## Decisions

- **D1**: `helpers/path-access.ts` → renamed to `helpers/path-helpers.ts`,
  keeping only `isSubPath` / `isSubPathOrSelf` (still used by bash's cwd
  reset). `checkAccess` and `AccessCheckResult` are deleted.
- **D2**: `Agent.workingDirectory` narrows from `string | undefined` to
  `string`. The `?? os.tmpdir()` fallback is applied once in the `Agent`
  constructor; downstream code (ToolExecutionContext, bash, file tools) sees
  a guaranteed string.
- **D3**: Workspace existence/readability validation at service layer is
  retained (agent would otherwise fail on first bash).

## Design

### Layer-by-layer changes

**Service layer — `apps/backend/src/services/agent-session/`**

- `agent-session-service.ts`
  - `CreateSessionOptions.extraAllowedPaths` removed.
  - `hasExtraAllowedPaths`, `resolvedExtraFilePathEntries`, and the block
    that resolves paths from `settings.fileAccess.allowedPaths` — all
    removed. The `if (hasWorkspace || hasExtraAllowedPaths)` branch
    collapses to `if (workspace)`; since there is nothing else to pull from
    settings, `SettingsManager.getInstance().getAll()` for path resolution
    goes away.
  - `MainAgent`/`CodingAgent` constructor calls drop the second arg.
- `validation.ts`
  - `validateExtraPaths` deleted.
  - `validateSessionPaths` loses the `extraPaths` parameter; body collapses
    to the workspace branch.
- `types.ts`
  - `CreateSessionError.EXTRA_PATH_NOT_FOUND / NOT_DIRECTORY /
NOT_ACCESSIBLE / NOT_IN_ALLOWED_PATHS` deleted.
- `validation.test.ts`
  - The two `EXTRA_PATH_*` test cases removed. Signature changes in
    `validateSessionPaths` reflected in remaining tests.

**Agent subclasses — `apps/backend/src/agent/agents/`**

- `main-agent/main-agent.ts`, `coding-agent/coding-agent.ts`,
  `general-sub-agent/general-sub-agent.ts`,
  `coding-sub-agent/coding-sub-agent.ts`
  - Remove `extraAllowedPaths` parameter from constructor.
  - Remove it from `super(...)` options.
  - In `restore`, stop reading `snapshot.options.extraAllowedPaths`.

**Agent core — `apps/backend/src/agent-core/agent/`**

- `agent.ts`
  - Delete `private readonly extraAllowedPaths`.
  - Delete the `[{path: os.tmpdir(), mode: 'read-write'}, ...]` prepend.
  - `workingDirectory` becomes `string`: initialized to
    `options.workingDirectory ?? os.tmpdir()` at construction (or from
    `snapshot.options.workingDirectory ?? os.tmpdir()` on restore) — the
    fallback is applied once here and the field type is non-optional.
  - `shellState.cwd` no longer needs `?? os.tmpdir()`; it's just
    `this.workingDirectory`.
  - `toSnapshot()` writes `workingDirectory` as-is; drops the
    `extraAllowedPaths` field and its tmpdir filter.
  - `buildSystemPrompt(...)` call drops the `extraAllowedPaths` argument and
    the `?? os.tmpdir()` fallback for workingDirectory.
  - `ToolExecutionContext` construction drops `extraAllowedPaths` and the
    `?? os.tmpdir()` fallback for workingDirectory.
- `types.ts`
  - `AgentOptions.extraAllowedPaths` removed.
  - `agentSnapshotOptionsSchema.extraAllowedPaths` removed. (Zod's default
    non-strict parse silently drops unknown keys in old snapshots on disk.)
- `agent-catalog.ts`
  - `buildSystemPrompt` loses the `extraAllowedPaths` parameter.
  - "Additional accessible paths" block removed.
  - The two working-directory lines are replaced by one neutral environment
    hint:

    > `Working directory: {path}. Relative paths in file operations are resolved from this directory; shell commands start here by default.`

**Tool layer — `apps/backend/src/agent-core/tool/` and
`apps/backend/src/agent/tools/`**

- `agent-core/tool/types.ts`
  - `ToolExecutionContext.extraAllowedPaths` removed.
- `agent-core/tool/testing.ts`
  - `createMockContext` drops the `extraAllowedPaths: []` default.
- `helpers/path-access.ts` → renamed `helpers/path-helpers.ts`
  - Keep `isSubPath`, `isSubPathOrSelf`.
  - Delete `checkAccess`, `AccessCheckResult`.
  - Update the single remaining import site (bash `run-command.ts`) to the
    new module.
- File tools: `read-file.ts`, `write-file.ts`, `edit-file.ts`,
  `find-files.ts`, `search-files.ts`
  - Remove the `checkAccess` call and all resulting error branches
    (`ERROR_OUTSIDE_ALLOWED_DIRECTORIES`, `ERROR_READ_ONLY`). Corresponding
    failure `ToolResultData` payloads that only existed for these errors
    can be pruned; shared failure types in `@omnicraft/tool-schemas` may
    need trimming (verify during implementation).
  - Relative path resolution stays: `path.resolve(context.workingDirectory,
userPath)` for inputs that can be relative.
- `agent/tools/sub-agent/dispatch-agent-tool.ts`
  - Remove the `checkAccess` block around `args.workingDirectory`; keep
    `path.resolve(context.workingDirectory, args.workingDirectory)` to
    normalize.
  - `new GeneralSubAgent(getConfig, workingDirectory)` — drop third arg.

- File-tool tests (`read-file.test.ts`, `write-file.test.ts`,
  `edit-file.test.ts`, `find-files.test.ts`, `search-files.test.ts`)
  - Remove `describe('extraAllowedPaths', ...)` blocks entirely.
  - Any existing positive tests that relied on file access inside
    workingDirectory continue to pass — no change.

### Out-of-scope confirmations

- `SettingsManager` / `settings.fileAccess.allowedPaths` / settings UI:
  untouched.
- `@omnicraft/settings-schema`'s `AllowedPathEntry` type still exists;
  imports from non-settings modules (agent layer / service layer) are
  cleaned up where no longer needed.
- Bash tool's cwd-drift reset logic: unchanged. Still uses
  `isSubPathOrSelf(workingDirectory, result.cwd)` via the new
  `path-helpers` module.

## Risks

- Removing in-process path checks means a compromised prompt can direct file
  tools to read/write anywhere the OS user has permissions. Acceptable for a
  local-first tool; OS permissions remain the real boundary. Bash already
  had this property.
- Snapshot schema change: old snapshots on disk carry an `extraAllowedPaths`
  key that the new schema does not declare. Zod non-strict parse ignores it,
  so restore succeeds; no migration needed.

## Testing

- Service `validation.test.ts` — passes after removing extra-path cases.
- File-tool tests — describe blocks removed; positive cases still pass.
- Bash `run-command.test.ts` — unchanged: cwd-drift reset still tested.
- Manual smoke: create chat session without workspace → workingDirectory
  defaults to tmpdir → file tools and bash both function with tmpdir as
  base.
