# Agent Scratch Space (Session Workspace)

Linked issue: [#345 Session Workspace Support for Agent](https://github.com/Soulike/OmniCraft/issues/345)

## Problem

Today an agent has exactly one directory: its **working directory**
(`workingDirectory`). For the coding agent this is the user's repository; for
the chat agent it is an ephemeral `os.tmpdir()/{id}` fallback created by
`agentWorkingDirectoryService.createDefaultWorkingDirectory`
(`agent-core/agent/agent-working-directory-service.ts`).

That single directory conflates two things the agent should keep apart:

- **Task outputs** — the code, docs, and files the user actually asked for.
  These belong in the working directory (the repo).
- **Task-support files** — temporary notes, plans, intermediate artifacts,
  downloaded references, throwaway scripts. These are needed _during_ the work
  but are **not** part of the deliverable and must not pollute the repo.

With one directory, an agent that needs scratch space has nowhere clean to put
it, so support files either leak into the repo or land in `/tmp` paths the agent
was never told about. Large tool outputs already illustrate the problem: a big
`web_fetch` result (`agent/tools/web/web-fetch.ts:189`) and an over-32KB
`run_command` output (`agent/tools/bash/run-command.ts` → `resolveOutputFile`)
are written to random `os.tmpdir()` files, surfaced to the agent as absolute
paths that sit outside any workspace it knows about, and never cleaned up with
the session.

## Decision

Give every persisted session a second, first-class directory — the **scratch
space** — living beside its existing persistence files at
`{sessionsDir}/{id}/scratch`. The agent then reasons about two locations:

| Concept                       | Purpose                                                                   | Coding agent                     | Chat agent                |
| ----------------------------- | ------------------------------------------------------------------------- | -------------------------------- | ------------------------- |
| **Working directory** (`cwd`) | task home; where **outputs/deliverables** go; relative paths resolve here | user repo                        | _(none)_ → equals scratch |
| **Scratch space**             | per-session store for **task-support files that are not outputs**         | `{coding-sessions}/{id}/scratch` | `{sessions}/{id}/scratch` |

Key properties:

- The scratch space is **always present**. The base `Agent` derives and creates
  it; there is **no** `scratchDirectory` option to pass in.
- The working directory is still optional. When a caller does not supply one
  (the chat agent), the effective working directory **is** the scratch space:
  `effectiveWorkingDirectory = options.workingDirectory ?? scratchDirectory`.
  So the coding agent has two distinct directories (`cwd !== scratch`) while the
  chat agent has one (`cwd === scratch`), upgraded from today's ephemeral
  `os.tmpdir()` to a persistent, session-scoped, auto-cleaned directory.
- The harness permits access to **both** roots: file tools already accept
  absolute paths, and `run_command`'s cwd guard is widened to allow either root.
- The scratch path is **derivable** from `sessionsDir + id`, so nothing new is
  persisted in the snapshot and it is recomputed on restore.
- Scope: **backend only** (coding + chat agents). No frontend surfacing; no new
  tool parameters.

## Concept: working directory vs scratch space

This distinction is the heart of the feature and is taught to the model in the
system prompt (see "System prompt directives"). The rule the agent follows:

- Put anything that is part of the task's result in the **working directory**.
- Put anything that merely supports the work in the **scratch space**.
- Never leave scratch/intermediate files in the working directory; never place
  deliverables in the scratch space.

## The scratch directory

### Location and ownership

`{sessionsDir}/{id}/scratch`, a sibling of the session's existing
`snapshot.json`, `metadata.json`, and `sse-events.jsonl`
(`agent-core/agent/persistence/agent-persistence.ts`).

**Who decides the path and creates it: the base `Agent`.** This is forced by
construction order — the path depends on the agent `id`, and the id is minted
_inside_ the base constructor (`agent.ts:115`, `this.id = crypto.randomUUID()`).
The service layer calls `new CodingAgent(workspace, store.sessionsDir)` before
any id exists, and the concrete subclass cannot compute the path before
`super()` runs either. The base `Agent` is the only actor holding both
`sessionsDir` and `id` at the right moment, and it already owns the
`{sessionsDir}/{id}/` layout (it creates that directory for the snapshot at
construction, `agent.ts:132-139`).

- Path convention lives next to the persistence helpers: add
  `agentPersistence.scratchPath(sessionsDir, id)` →
  `path.join(sessionsDir, id, 'scratch')`, mirroring `snapshotPath` / `eventsPath`.
- Resolution + creation is performed by a small service that replaces/repurposes
  the current `agentWorkingDirectoryService`. Reuse its hardening (UUID
  validation of the id segment, `mkdir 0o700`, `lstat` symlink rejection,
  re-`chmod`, return `realpathSync`).

### Precedence

The base `Agent` resolves the scratch directory as:

1. `sessionsDir` set → `{sessionsDir}/{id}/scratch` (persistent, cleaned with the
   session).
2. else (in-memory agents / tests, `sessionsDir === null`) →
   `os.tmpdir()/{id}/scratch` (matches today's ephemeral fallback shape).

### Effective working directory and persistence

The `Agent` keeps the caller-provided value separately from the derived one:

- `this.scratchDirectory` — always set (derived + created as above).
- `this.workingDirectory` (effective) = `options.workingDirectory ?? this.scratchDirectory`.

`toSnapshot()` persists **only the caller-provided primary** working directory
(i.e. `options.workingDirectory`, which may be `undefined`), not the resolved
effective value. The existing snapshot field `options.workingDirectory` is
already optional (`agent-core/agent/types.ts:27-29`), so **no schema change** is
needed. On restore:

- Coding agent: primary = repo → effective cwd = repo; scratch recomputed.
- Chat agent: primary = `undefined` → effective cwd = scratch (recomputed to the
  same stable path).

> Note: this changes the current behavior where `toSnapshot()` persists the
> _resolved_ working directory. Persisting the primary is what lets a restored
> chat agent recompute its scratch-backed cwd instead of pinning a stale path.

## Plumbing the scratch directory to tools

`scratchDirectory` becomes a first-class field on the tool execution context,
always a string:

- `agent-core/tool/types.ts` — add `readonly scratchDirectory: string;` to
  `ToolExecutionContext`.
- `agent-core/agent/agent-runtime-state.ts` — add `scratchDirectory` to
  `BuildToolExecutionContextInput` and pass it through
  `buildToolExecutionContext`.
- `agent-core/agent/agent-turn-runner.ts` — carry `scratchDirectory` on
  `RunAgentTurnInput` and forward it to `agentToolExecutor.execute(...)`.
- `agent-core/agent/agent-tool-executor.ts` — thread it into the runtime-state
  call.
- `agent-core/agent/agent.ts` — pass `this.scratchDirectory` into
  `runAgentLoop` / the turn runner.
- `agent-core/tool/testing.ts` — the tool-test context helper gains
  `scratchDirectory: overrides?.scratchDirectory ?? os.tmpdir()`.

## Harness access to both paths

- **File tools** (`read/write/edit/find/search` in `agent/tools/file/`) need
  **no change**. They resolve `path.resolve(workingDirectory, filePath)`; an
  absolute path (the scratch path the agent is given in its prompt) already
  resolves to itself. There is no sandbox guard on file tools today, and this
  design does not add one.
- **`run_command`** (`agent/tools/bash/run-command.ts:118-131`) — widen the cwd
  guard so a resulting cwd is accepted when it is inside **either**
  `realpath(workingDirectory)` **or** `realpath(scratchDirectory)`. When the two
  are equal (chat agent) the roots list simply deduplicates. The reset target on
  escape stays the working directory. This delivers the "second sandbox root":
  the agent may `cd` into scratch and run scratch scripts, clone reference repos,
  etc.

## System prompt directives

The single injection point is `buildEnvironmentSection` in
`agent-core/agent/catalog/agent-catalog.ts:8-21`, called from
`buildSystemPrompt`. It gains a second parameter (the scratch directory) and
selects one of two templates on `workingDirectory === scratchDirectory`.

### Template A — distinct directories (`cwd !== scratch`, e.g. coding agent)

```
## Environment

- OS: <type> <release> (<platform>, <arch>)
- Shell: <SHELL>
- Working directory: <workingDirectory>
- Scratch space: <scratchDirectory>
- Time zone: <tz>

Relative paths in file operations are resolved from the working directory. Shell
commands start in the working directory by default, though shell cwd can change
between command calls when commands change directories.

## Working Directory vs Scratch Space

You have access to two locations:

- The working directory (<workingDirectory>) is where the task lives. Everything
  the user expects as an output of the task — code, docs, and any files that are
  part of the deliverable — belongs here. Relative paths resolve here.
- The scratch space (<scratchDirectory>) is a private area for this session. Use
  it for files that support your work but are not part of the task's output:
  temporary notes, plans, intermediate artifacts, downloaded references, and
  throwaway scripts. Address it by its absolute path. It persists for the life
  of the session and is discarded when the session is deleted.

Keep the two separate: do not leave scratch or intermediate files in the working
directory, and do not place deliverables in the scratch space. When unsure
whether a file is a deliverable, keep it in the scratch space and tell the user.
```

### Template B — single directory (`cwd === scratch`, e.g. chat agent)

```
## Environment

- OS: <type> <release> (<platform>, <arch>)
- Shell: <SHELL>
- Working directory: <scratchDirectory>
- Time zone: <tz>

Relative paths in file operations are resolved from the working directory. Shell
commands start in the working directory by default, though shell cwd can change
between command calls when commands change directories.

## Scratch Space

This session has no project repository. Your working directory
(<scratchDirectory>) is a private scratch space for this session: use it for any
files you need to create while working — notes, drafts, downloaded references,
and intermediate artifacts. It persists for the life of the session and is
discarded when the session is deleted.
```

## Subagents

Subagents are `Agent` instances with their own `sessionsDir`
(`{parentSessionsDir}/{parentId}/subagents`, `agent/tools/sub-agent/dispatch-agent-tool.ts:98-103`)
and their own `id`, so — with no `scratchDirectory` option — each subagent
**derives its own** scratch at `{...}/subagents/{subId}/scratch`. Subagents keep
today's behavior otherwise: their working directory is still validated to be
within the parent's working directory (`dispatch-agent-tool.ts:186`), and they
receive the same two-location environment section via `buildSystemPrompt`.

Cross-agent sharing is intentionally not built in: if a parent needs a subagent
to write into the parent's scratch, it can pass that absolute path in the task
(file tools accept absolute paths). Shared/inherited scratch can be added later
as a non-breaking follow-up if a real need appears.

## Relocating agent-facing temp outputs into scratch

Two tool outputs are handed to the agent as retained file paths and today land
in `os.tmpdir()`. They are exactly "task-support artifacts" and move into the
scratch directory:

1. **`web_fetch`** (`agent/tools/web/web-fetch.ts:186-200`) — the over-`MAX_INLINE_SIZE`
   markdown file. `web-fetch` already receives `context` (currently `_context`),
   so pass `context.scratchDirectory`.
2. **`run_command`** (`agent/tools/bash/run-command.ts` → `resolveOutputFile`,
   backed by `ShellCommandRunner`) — the retained over-32KB stdout/stderr file.
   Pass `context.scratchDirectory` into the runner so its stream temp files are
   created under scratch; small outputs are still deleted immediately, large
   ones are retained already inside scratch.

Helper signature changes (`helpers/fs.ts`):

- `writeToTempFile(content, extension, dir = os.tmpdir())`
- `createTempFileWriteStream(extension, dir = os.tmpdir())`
- `ShellCommandRunner` gains an output-directory constructor argument (default
  `os.tmpdir()`) used for the stdout/stderr stream files.

**Left in `os.tmpdir()` (transient internal plumbing, never surfaced):** the
`ShellCommandRunner` cwd-capture file (`shell-command-runner.ts:72`) and the
short-lived small stdout/stderr files that are read-then-deleted. Only the
retained, agent-visible file needs to be in scratch.

## Lifecycle and persistence

- **Created** eagerly at agent construction (when `sessionsDir` is set),
  alongside the snapshot directory.
- **Persisted across restart** because it is a real directory under the data dir
  and its path is recomputed deterministically on restore.
- **Deleted with the session**: `CodingAgentStore.deleteFromDisk` /
  `MainAgentStore.deleteFromDisk` already `rm -rf {sessionsDir}/{id}`, which
  removes `scratch` for free.
- **Not stored in the snapshot** (derivable).

### Backward compatibility

Chat snapshots written before this change persisted the _resolved_
`os.tmpdir()/{id}` cwd. Restored under the new code, that persisted primary is
non-`undefined`, so the old session would keep a stale tmpdir cwd (Template A)
instead of adopting its scratch. This matches today's behavior (restore never
recreated that tmpdir either) and only affects old chat sessions, which are
transient. Optional hardening: on restore, if the persisted primary matches the
legacy `os.tmpdir()/{id}` shape, treat it as `undefined` so the session adopts
its scratch-backed cwd. New sessions are unaffected (they persist `undefined`).

## Security considerations

- Scratch directories are created `0o700`, with the existing symlink/UUID
  hardening carried over from `agentWorkingDirectoryService`.
- The `run_command` cwd guard is widened, not removed; escape still resets to the
  working directory.
- File tools remain un-sandboxed (unchanged from today) — the scratch space adds
  a _declared_ place for support files but does not tighten or loosen file-tool
  path handling.

## Files to change

Backend (`apps/backend/src`):

- `agent-core/agent/agent-working-directory-service.ts` → replace/repurpose as
  the scratch-directory service (derive + create, both precedence cases).
- `agent-core/agent/persistence/agent-persistence.ts` → add `scratchPath`.
- `agent-core/agent/agent.ts` → derive/create scratch; compute effective
  `workingDirectory`; persist primary only; expose scratch; pass to turn runner.
- `agent-core/agent/agent-runtime-state.ts` → thread `scratchDirectory`.
- `agent-core/agent/agent-turn-runner.ts` → carry + forward `scratchDirectory`.
- `agent-core/agent/agent-tool-executor.ts` → forward `scratchDirectory`.
- `agent-core/agent/catalog/agent-catalog.ts` → two-template
  `buildEnvironmentSection`; pass scratch through `buildSystemPrompt`.
- `agent-core/tool/types.ts` → `ToolExecutionContext.scratchDirectory`.
- `agent-core/tool/testing.ts` → default `scratchDirectory`.
- `agent/tools/bash/run-command.ts` + `helpers/shell-command-runner.ts` +
  `helpers/fs.ts` → route retained large output to scratch.
- `agent/tools/web/web-fetch.ts` → route large fetch content to scratch.

No changes to: settings schema / workspace validation (scratch is
system-managed, not a configured workspace), tool schemas, or the frontend.

## Testing plan

- **Scratch service** — path shape for both precedence cases; `0o700`; symlink
  rejection; non-UUID id rejection.
- **`agent.ts`** — coding agent: `cwd === repo`, `scratch === {…}/scratch`,
  `cwd !== scratch`; chat agent: `cwd === scratch`; snapshot persists primary
  only; restore recomputes correctly for both.
- **`buildEnvironmentSection` / `system-prompt.test.ts`** — Template A when
  distinct, Template B when equal; scratch path present.
- **`run_command` cwd guard** — `cd` into scratch persists; `cd` outside both
  roots resets to the working directory; equal-roots (chat) case.
- **`web_fetch` / `run_command` overflow** — large outputs are written under the
  provided scratch dir, not `os.tmpdir()`; small outputs unaffected.
- **Session delete** — scratch removed with `{sessionsDir}/{id}`.

## Out of scope

- Frontend surfacing of the scratch path (InfoBar/AccessInfo).
- An explicit `workspace: 'repo' | 'scratch'` parameter on file tools
  (addressing stays relative→cwd / absolute→scratch).
- Shared/inherited scratch between a parent agent and its subagents.
- Changing the data-dir root name. `getDataDir()` is `~/.omni-craft`
  (`helpers/env.ts:6`); issue #345's `~/.omnicraft/...storage` wording is
  informal and not literal — we use the real `getDataDir()` root with a
  `scratch` folder.
