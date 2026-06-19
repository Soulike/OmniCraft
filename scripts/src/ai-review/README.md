# AI PR Review Gate

A `pull_request`-triggered gate that reviews the **full diff of each open PR
against its base branch** with the GitHub Copilot CLI, posts one PR review per
round, and blocks merges on confirmed Medium+ findings. Deterministic logic lives
in `@omnicraft/ai-review-core` (unit-tested); model invocation and posting are
delegated to the CLI via the prompts in `prompts/`.

## Maintainer prerequisites (one-time)

1. Create a fine-grained PAT whose only permission is **"Copilot Requests"**;
   store it as the repository secret **`COPILOT_CLI_TOKEN`**.
2. After the first green run, mark the **`AI Review Gate`** check as **required**
   in branch protection for `main`. Because the workflow is triggered by
   `pull_request`, every job (including `gate`) shows up natively in the PR's
   check list.
3. (Optional) Set repository **Variables** to override model defaults without
   editing the workflow, and confirm they are available on the Copilot plan:
   - `AI_REVIEW_REVIEWER_MODELS` (comma-separated, e.g. `gpt-5.5,claude-opus-4.8`)
   - `AI_REVIEW_CONFIRM_MODEL` (e.g. `claude-opus-4.8`)
   - `AI_REVIEW_EFFORT` (`none|low|medium|high|xhigh|max`)

The `AI Approved` / `AI Need Change` labels are created automatically.

## Scope

- Same-repository branches only. **Fork PRs are unsupported** (no secret access).
- The gate reviews and reports; it never auto-fixes or pushes commits.
- It posts `event: COMMENT` reviews; blocking is enforced by the failing `gate`
  check, not by a formal GitHub review state.
- It runs independently on every PR push — it does **not** wait for or depend on
  the `CI` workflow. A new push cancels any in-progress run for the same PR
  (`concurrency` keyed on the PR number).

## Security model

This workflow is triggered by `pull_request`, so the workflow definition and the
scripts it runs come from the **PR branch**, not the default branch. That means a
PR can, in principle, modify `gate.ts` / `ai-review.yml` / the prompts to approve
itself — **the gate is not tamper-proof against a malicious same-repo PR.** This
is an accepted trade-off for this repo because it is **single-maintainer and forks
are excluded**: anyone who can open a same-repo PR already has write access to the
default branch and could change the gate directly, so there is no privilege to
escalate. (If this repo ever takes outside contributors, switch the trigger back
to `workflow_run` — which always runs the default-branch copy — to restore
tamper-resistance.)

Two further deliberate, bounded risks:

- **The reviewer/confirmation agents run the PR's build and tests** (full
  `shell`, `read`, `write`) and have **unrestricted network access**
  (`--allow-all-urls`) so they can empirically validate findings and look things
  up (CVE databases, library docs, etc.). This executes collaborator code in CI
  with outbound network. Each job holds the **minimum** GitHub scope it needs:
  the `review` jobs are read-only (`contents: read`, `pull-requests: read`),
  while `confirm` adds `pull-requests: write` (to post the review) and `gate`
  adds `issues: write` (to apply labels) — both agents still run PR code, so the
  write scope on `confirm` is part of the exposure surface, not exempt from it.
  Residual exposure: a prompt-injection payload in the PR diff could combine
  shell + network to exfiltrate data a job can read, or (on `confirm`) post on
  its behalf. Shell is **not** restricted to a command allowlist: under the
  `pull_request` trigger the workflow itself comes from the PR branch, so a
  hostile PR could already lift any such limit — scoping shell would add friction
  without a real boundary. The boundaries that still hold are `--secret-env-vars`
  (token stripping, below) and the read-only GitHub scopes on the review jobs.
- **`--secret-env-vars COPILOT_GITHUB_TOKEN`** strips the Copilot model-access
  token (the low-privilege "Copilot Requests" PAT) from any shell the agent
  spawns, so executing PR code cannot read it. The built-in `GH_TOKEN` used for
  posting is the standard `github.token`, scoped per job.

Untrusted values that reach a `git`/`gh` argv (`GH_REPO`, `PR_NUMBER`, the PR's
base ref and head SHA) are validated by `validate.ts` and option-terminated with
`--`, so a crafted branch name cannot smuggle a flag.

## Manual integration checklist (run once on a throwaway PR)

- [ ] **First run:** open a PR with a small change; confirm the AI review runs,
      reviews the full `origin/<base>...HEAD` diff, posts one review with the
      summary + marker, and the `gate` check appears in the PR check list.
- [ ] **Second push:** push another commit; confirm a fresh full review runs and
      the previous in-progress run was cancelled (concurrency).
- [ ] **Merge base into the PR:** merge `main` into the PR branch and push;
      confirm the review still only flags the PR's own changes, not commits that
      came from `main`.
- [ ] **No-new-commits short-circuit:** re-run with the head unchanged; confirm
      the gate carries the prior verdict without re-reviewing.
- [ ] **Dedup:** leave a prior bot finding unresolved, push a trivial change;
      confirm reviewers do not re-report the already-open finding, but a newly
      introduced issue is still reported.
- [ ] **Red gate:** introduce a deliberate Medium+ issue; confirm the gate fails,
      inline comments are posted, and the `AI Need Change` label is applied.
- [ ] **Green gate:** with no Medium+ issues, confirm the gate passes and the
      `AI Approved` label is applied (and `AI Need Change` removed).
