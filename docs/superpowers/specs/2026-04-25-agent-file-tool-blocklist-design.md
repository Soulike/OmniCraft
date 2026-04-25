# Agent File Tool Blocklist Design

## Background

Agent file tools currently resolve paths against the agent working directory and
then read, write, enumerate, or search directly. Workspace settings validate that
configured directories exist and are readable/writable, but they do not exclude
sensitive descendants. If a user configures a broad workspace such as the home
directory, file tools can reach sensitive paths like `.ssh` or the app's own
settings directory.

This design adds a default blocklist for agent file tools. It is a guardrail for
the typed file tools, not a complete local sandbox. Shell commands remain a
separate boundary.

## Goals

- Prevent file tools from reading, writing, returning, or searching high
  confidence sensitive paths.
- Apply the same policy consistently across direct file operations,
  recursive search tools, and workspace validation.
- Avoid LLM-facing bypass knobs.
- Keep legitimate explicit symlink use possible only when the resolved target is
  allowed.
- Tell the agent how to respond when a blocked operation is necessary.

## Non-Goals

- No shell-command mediation in this change. `run_command` can still access any
  path the OS user can access.
- No user-configurable allow overrides in the initial implementation.
- No attempt to detect every secret filename. The first blocklist is deliberately
  high confidence.
- No automatic disclosure of every skipped sensitive path during broad searches.

## Default Blocklist

The policy blocks both exact roots and sensitive names/patterns. Paths are
checked after normalization. Direct operations also check real filesystem targets
where applicable.

### Blocked Roots

Resolve these roots from the current OS user and app environment:

- `~/.ssh`
- `~/.gnupg`
- `~/.pki`
- `~/.aws`
- `~/.azure`
- `~/.config/gcloud`
- `~/.config/gh`
- `~/.kube`
- `~/.docker`
- `~/.terraform.d`
- `DATA_DIR` if set, otherwise `~/.omni-craft`
- macOS credential/browser stores:
  - `~/Library/Keychains`
  - `~/Library/Application Support/Google/Chrome`
  - `~/Library/Application Support/Chromium`
  - `~/Library/Application Support/BraveSoftware`
  - `~/Library/Application Support/Firefox`

Also block VCS metadata directories by path segment anywhere under a workspace:

- `.git`
- `.hg`
- `.svn`

The VCS block does not block useful sibling files like `.gitignore`.

### Blocked Files and Patterns

Block exact basename matches:

- `.netrc`
- `.git-credentials`
- `.npmrc`
- `.pypirc`
- `.pgpass`
- `.my.cnf`
- `.bash_history`
- `.zsh_history`
- `.fish_history`
- `.psql_history`
- `.mysql_history`
- `.sqlite_history`
- `credentials.json`

Block pattern matches:

- `.env` and `.env.*`, except `.env.example`, `.env.sample`, and
  `.env.template`
- `*.pem`
- `*.key`
- `*.p12`
- `*.pfx`
- `id_rsa`, `id_dsa`, `id_ecdsa`, and `id_ed25519`
- `*service-account*.json`

## Architecture

Add one central backend policy helper for file tools:

`apps/backend/src/agent/tools/file/sensitive-path-policy.ts`

The helper owns:

- default blocked root construction using `os.homedir()` and `getDataDir()`
- normalized lexical path checks
- realpath checks for existing paths
- nearest-existing-parent resolution for writes to new paths
- result helpers that format the standard policy failure message

Helper API:

```ts
type FileAccessOperation = 'read' | 'write' | 'edit' | 'find' | 'search';

type FileAccessPolicyResult =
  | {allowed: true}
  | {allowed: false; message: string};

async function checkExistingPathAccess(
  absolutePath: string,
  operation: FileAccessOperation,
): Promise<FileAccessPolicyResult>;

async function checkNewPathAccess(
  absolutePath: string,
): Promise<FileAccessPolicyResult>;

function checkLexicalPathAccess(
  absolutePath: string,
  operation: FileAccessOperation,
): FileAccessPolicyResult;
```

Every file tool must call this policy module rather than duplicating blocklist
logic locally.

## Tool Behavior

### Direct File Tools

`read_file`, `edit_file`, and existing-file `write_file`:

1. Resolve the requested path against `workingDirectory`.
2. Check the normalized lexical path.
3. Resolve the real target with `fs.realpath` after confirming the path exists.
4. Check the real target.
5. Continue only if both checks pass.

New-file `write_file`:

1. Resolve the requested path against `workingDirectory`.
2. Check the normalized lexical path.
3. Resolve the nearest existing parent with `fs.realpath`.
4. Reconstruct the intended real target by appending the non-existing suffix.
5. Check that reconstructed target.
6. Continue only if both checks pass.

This catches paths such as `workspace/link-to-home/.ssh/new-key` when
`link-to-home` is a symlink to the user's home directory.

### Recursive Search Tools

`find_files` and `search_files` do not follow symbolic links.

- Set `followSymbolicLinks: false` in `fast-glob` options.
- Policy-check the search root before starting the glob. This check includes
  realpath, because fast-glob's symlink option does not protect a symlinked base
  directory.
- Skip symbolic-link entries entirely. This includes symlinked files and
  symlinked directories.
- Filter every returned or searched entry through the lexical policy before
  returning it from `find_files` or opening it in `search_files`.
- Skip blocked descendants during broad searches and append a policy note when
  anything was skipped.

The tool descriptions should mention this behavior:

- `find_files`: `Symlinked directories and files are not traversed or returned. If expected files are missing from results, review whether they are behind a symlink; do not attempt to bypass file access policy.`
- `search_files`: `Symlinked directories and files are not traversed or searched. If expected matches are missing, review whether the files are behind a symlink; do not attempt to bypass file access policy.`

No LLM-facing option is added to enable symlink following.

## Error Handling

Direct blocked operations fail with this message shape:

```text
Error: Access denied by file access policy: <path>. This operation would access a blocked sensitive path. Review the file access operation. If this operation is necessary, stop and ask the user to perform it manually.
```

Broad search tools skip blocked descendants and add a final note when one or
more entries were skipped:

```text
Some paths were skipped because they are blocked by file access policy. Do not try to bypass this policy. If accessing those paths is necessary, stop and ask the user to perform the operation manually.
```

Search tools should not enumerate every skipped blocked path. Direct operations
may include the requested path because the agent already supplied it.

## Workspace Validation

Workspace settings validation should reject workspaces that are blocked by the
same policy.

- Add `PathValidationError.BLOCKED`.
- `normalizeAndValidatePaths` checks the normalized path against the file access
  policy after absolute-path validation and duplicate detection.
- A user cannot configure `.ssh`, `~/.omni-craft`, `.git`, or another blocked
  root as the workspace itself.

This validation does not reject a normal project workspace merely because it
contains blocked descendants such as `.git` or `.env`; those descendants are
filtered by the tools at use time.

## Data Flow

Direct read/edit/write:

1. Tool receives path from LLM.
2. Tool resolves against `context.workingDirectory`.
3. Policy module checks lexical and real target paths.
4. Tool either fails with the standard policy message or proceeds with the
   existing file operation.

Find/search:

1. Tool receives search root and pattern from LLM.
2. Tool resolves and policy-checks the search root.
3. Tool runs fast-glob with `followSymbolicLinks: false`.
4. Tool skips symlink entries and blocked entries.
5. Tool returns normal results plus the skipped-path policy note if needed.

Workspace save:

1. Settings endpoint receives workspace entries.
2. Existing normalization/validation runs.
3. The policy rejects blocked workspace roots with `BLOCKED`.
4. Valid workspaces are saved unchanged.

## Testing

Add focused tests around the new policy and each affected integration point.

Policy helper tests:

- blocks `~/.ssh` and descendants
- blocks `DATA_DIR` or `~/.omni-craft`
- blocks `.git` path segments but not `.gitignore`
- blocks `.env` and `.env.local` but allows `.env.example`
- blocks private key extensions and exact secret filenames
- catches symlinks whose real target is blocked
- catches new-file writes through a symlinked parent

Tool tests:

- `read_file` fails on blocked direct paths with the standard message
- `write_file` fails on blocked existing and new paths
- `edit_file` fails before reading/writing blocked paths
- `find_files` skips blocked entries and symlink entries, then appends the
  policy note
- `search_files` does not search blocked entries or symlink entries, then
  appends the policy note
- search root that is itself a symlink to a blocked directory fails

Settings tests:

- workspace save rejects blocked roots with `PathValidationError.BLOCKED`
- normal workspaces containing blocked descendants remain valid

## Risks and Follow-Ups

- This does not stop `run_command` from accessing sensitive files. Treat shell
  mediation or a restricted-command mode as a separate follow-up if the threat
  model requires it.
- The initial blocklist may need tuning if it blocks legitimate project files.
  Prefer adding human-controlled settings later over adding tool parameters that
  the LLM can choose.
- Browser profile blocking may vary by OS and browser. The first implementation
  should keep these paths centralized so additions are straightforward.
