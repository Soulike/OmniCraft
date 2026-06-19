# AI PR Review Gate

A `workflow_run`-triggered gate that reviews each push to an open PR with the
GitHub Copilot CLI, posts one PR review per round, and blocks merges on
confirmed Medium+ findings. Deterministic logic lives in
`@omnicraft/ai-review-core` (unit-tested); model invocation and posting are
delegated to the CLI via the prompts in `prompts/`.

## Maintainer prerequisites (one-time)

1. Create a fine-grained PAT whose only permission is **"Copilot Requests"**;
   store it as the repository secret **`COPILOT_CLI_TOKEN`**.
2. After the first green run, mark the **`AI Review Gate`** check as **required**
   in branch protection for `main`.
3. (Optional) Set repository **Variables** to override model defaults without
   editing the workflow, and confirm they are available on the Copilot plan:
   - `AI_REVIEW_REVIEWER_MODELS` (comma-separated, e.g. `gpt-5.5,claude-opus-4.8`)
   - `AI_REVIEW_CONFIRM_MODEL` (e.g. `claude-opus-4.8`)
   - `AI_REVIEW_EFFORT` (`none|low|medium|high|xhigh|max`)
4. Keep the CI workflow named **`CI`**; the gate's `workflow_run` trigger
   references it by that name.

The `AI Approved` / `AI Need Change` labels are created automatically.

## Scope

- Same-repository branches only. **Fork PRs are unsupported** (no secret access).
- The gate reviews and reports; it never auto-fixes or pushes commits.
- It posts `event: COMMENT` reviews; blocking is enforced by the failing check,
  not by a formal GitHub review state.

## Security model

The gate runs every gate-critical piece — `check-config.ts`, `resolve-range.ts`,
`read-verdict.ts`, `gate.ts`, and the prompt files — from the **trusted default
branch** (`workflow_run` always uses the default-branch copy of the workflow).
The PR's own code is checked out separately into `pr-head/` purely as the subject
of review. This prevents a PR from tampering with the verdict.

Two deliberate, bounded risks remain (accepted by design, not oversights):

- **The reviewer/confirmation agents run the PR's build and tests**
  (`shell(bun:*)`, `shell(gh:*)`, `shell(git:*)`, `read`, `write`) and have
  **unrestricted network access** (`--allow-all-urls`) so they can empirically
  validate findings and look things up (CVE databases, library docs, etc.). This
  executes collaborator code in CI with outbound network. It is acceptable
  because forks are excluded, `ci.yml` already runs the same code, the repo is
  single-maintainer, and the reviewer jobs hold only read-scoped GitHub
  permissions. Note the residual exposure: a prompt-injection payload in the PR
  diff could combine shell + network to exfiltrate data the job can read. Shell
  tools stay scoped to `git`/`gh`/`bun` (not `--allow-all-tools`) to keep that
  blast radius bounded; if it ever feels too broad, narrow the network with a
  domain allowlist (`--allow-url=...`) instead of `--allow-all-urls`.
- **`--secret-env-vars COPILOT_GITHUB_TOKEN`** strips the Copilot model-access
  token (the low-privilege "Copilot Requests" PAT) from any shell the agent
  spawns, so executing PR code cannot read it. The built-in `GH_TOKEN` used for
  posting is the standard `github.token`, scoped per job.

Untrusted values that reach a `git`/`gh` argv (`GH_REPO`, `PR_NUMBER`, the PR's
base ref and head SHA) are validated by `validate.ts` and option-terminated with
`--`, so a crafted branch name cannot smuggle a flag.

## Manual integration checklist (run once on a throwaway PR)

- [ ] **First run (full review):** open a PR with a small change; confirm CI
      passes, the AI review runs, posts one review with the summary + marker, and
      the gate check reports.
- [ ] **Incremental second push:** push another commit; confirm the next review
      covers only the new commits (range `start..head`, not the whole PR).
- [ ] **Force-push fallback:** rebase/force-push; confirm the review falls back to
      a full `base...head` review.
- [ ] **No-new-commits carry-forward:** re-run with head unchanged (e.g. re-run
      CI); confirm the gate carries the prior verdict without re-reviewing.
- [ ] **Repro-test path:** introduce a subtle bug a reviewer can confirm by
      writing+running a throwaway test; confirm the confirmation agent re-runs it.
- [ ] **Red gate:** introduce a deliberate Medium+ issue; confirm the gate fails,
      inline comments are posted, and the `AI Need Change` label is applied.
- [ ] **Green gate:** with no Medium+ issues, confirm the gate passes and the
      `AI Approved` label is applied (and `AI Need Change` removed).
