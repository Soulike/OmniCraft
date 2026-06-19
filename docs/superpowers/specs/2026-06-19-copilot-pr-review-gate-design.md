# Copilot CLI PR Review Gate

## Problem

We want an automated code-review gate on pull requests, powered by the GitHub
Copilot CLI under the maintainer's Copilot subscription. The gate should behave
like a panel of human experts: several reviewers read the change and write
reports, then a senior reviewer reconciles those reports, re-checks the code,
discards false positives, and leaves precise inline comments plus an overall
verdict that can block the merge.

Concretely (from issue #291):

1. Review multiple aspects — bugs, code quality, structural design, security —
   reusing the CLI's built-in review capabilities.
2. Two reviewers using different models (latest GPT and latest Claude Opus, both
   at `xhigh` reasoning), plus a confirmation agent that merges their findings,
   re-verifies them, removes false positives, and tags the result
   `AI Approved` / `AI Need Change`.
3. Review only the diff since the last review (the new commits), not the whole
   PR every time.
4. Reviewers and the confirmation agent must be able to read PR context
   (description, existing comments/reviews) and the diff.

## Goals

- A required CI check that fails when confirmed issues of severity Medium or
  higher exist, and passes otherwise.
- Each push to an open PR triggers an incremental review of only the commits
  added since the previous review.
- The confirmation agent posts one GitHub PR review per round: a human-readable
  summary plus inline comments anchored to the exact lines.
- Reviewers can empirically validate a suspected bug by writing and running a
  throwaway test, and present that proof in their report; the confirmation agent
  can re-run it to confirm or refute the finding.
- No malformable structured artifacts in the model's output path — reviewers
  emit prose reports; the only machine token is a verdict marker the agent
  writes into the summary it posts anyway.
- Deterministic, testable logic (range resolution, marker parsing) lives in a
  unit-tested package; model invocation and posting are delegated to the agent.

## Non-Goals

- Reviewing pull requests from forks. Forked PRs cannot read the Copilot secret,
  so the gate is for same-repository branches only.
- Auto-fixing issues or pushing commits. The gate only reviews and reports.
- Approving/requesting-changes as a formal GitHub review state. The bot posts
  `event: COMMENT` reviews; blocking is enforced by the failing check, not the
  review state (the Actions bot cannot reliably submit `APPROVE` /
  `REQUEST_CHANGES`).
- Auto-selecting "the latest model in a family." Copilot CLI has no family
  alias; concrete model IDs are pinned and bumped manually.

## Approach

A dedicated workflow, `.github/workflows/ai-review.yml`, runs **after the `CI`
workflow succeeds** on a pull request. It has five single-purpose jobs: `config`
validates configuration and emits the model matrix, `prepare` resolves what to
review, a matrix `review` job runs the model reviewers in parallel, `confirm`
reconciles their reports and posts the PR review, and `gate` decides the outcome
and is the required check. Branching lives in `needs`/`if` between jobs, not
inside them.

Gating on CI success avoids spending premium-request credits reviewing code that
does not compile or pass tests, and stops reviewers from re-flagging failures
`ci.yml` already reports. When CI fails the AI review never runs, so the `gate`
check produces no conclusion — the PR is already blocked by the red CI check.

The model never emits structured JSON that another step must parse. Reviewers
write Markdown reports (passed between jobs as plain-text artifacts). The
confirmation agent reads those reports, re-verifies against the real code, and
posts its review directly via `gh`. The only machine-readable token is embedded
in the summary the agent posts:

```
<!-- ai-review reviewed-head=<HEAD_SHA> verdict=approved|need_change -->
```

### Trigger and concurrency

The workflow is triggered by the completion of the `CI` workflow and runs only
when CI succeeded on a pull request:

```yaml
on:
  workflow_run:
    workflows: ['CI']
    types: [completed]
concurrency:
  group: ai-review-${{ github.event.workflow_run.head_branch }}
  cancel-in-progress: true
```

Every job is guarded so the workflow no-ops unless CI passed for a PR:

```yaml
# config (entry job) and the gate:
if: >-
  github.event.workflow_run.event == 'pull_request' &&
  github.event.workflow_run.conclusion == 'success'
```

`gate` additionally uses `always()` (`always() && <the guard above>`) so it still
reports a conclusion when an AI-review job fails, but is skipped entirely when CI
did not succeed. Because `workflow_run` carries no PR event context, `prepare`
resolves the PR number and head SHA from `github.event.workflow_run.pull_requests`
(populated for same-repo PRs), falling back to
`gh api repos/{owner}/{repo}/commits/{head_sha}/pulls`. The workflow depends on
the CI workflow being named `CI`.

### Authentication (two separate tokens, least privilege)

- `COPILOT_GITHUB_TOKEN` — from repo secret **`COPILOT_CLI_TOKEN`**, a
  fine-grained PAT whose only permission is **"Copilot Requests"**. Grants the
  CLI model access. Set as a prerequisite by the maintainer.
- `GH_TOKEN` — `${{ github.token }}` (the built-in `GITHUB_TOKEN`), used by `gh`
  for PR-context reads and for posting the review.

The built-in GitHub MCP server stays disabled; PR context is read with `gh`.

### Models and configuration

Model IDs and reasoning effort are defined once in a workflow-level `env:` block
(optionally backed by repository **Variables** so they can be changed in GitHub
Settings without editing the file):

```yaml
env:
  # comma-separated; drives the reviewer matrix
  REVIEWER_MODELS: ${{ vars.AI_REVIEW_REVIEWER_MODELS || 'gpt-5.5,claude-opus-4.8' }}
  CONFIRM_MODEL: ${{ vars.AI_REVIEW_CONFIRM_MODEL  || 'claude-opus-4.8' }}
  REASONING_EFFORT: ${{ vars.AI_REVIEW_EFFORT         || 'xhigh' }}
```

The `config` job converts `REVIEWER_MODELS` into a JSON array output, which the
`review` job consumes as its matrix (`matrix: model: ${{ fromJSON(...) }}`), so
even the matrix reads from this single source. `confirm` uses `CONFIRM_MODEL`;
all model invocations pass `--effort ${REASONING_EFFORT}`.

Availability depends on the maintainer's Copilot plan. Reviewers and the
confirmation agent run with `--context long_context` to tolerate larger diffs.

### Jobs

Each job has one purpose; branching lives in `needs`/`if`, not inside jobs.

**1. `config`** (checkout default branch + setup; permissions: none; entry guard:
`workflow_run.event == 'pull_request' && workflow_run.conclusion == 'success'`)

Checks out the **default branch** (trusted code, never the PR's copy — see Trust
model) and installs deps, then runs `scripts/src/ai-review/check-config.ts`, which
fails fast with a clear message — before any model spend — when misconfigured:

- **Secrets:** the `COPILOT_CLI_TOKEN` secret must be non-empty (the built-in
  `GITHUB_TOKEN` is always present).
- **Env values:** `REVIEWER_MODELS` must be non-empty and parse to a list of
  distinct, non-blank model IDs (duplicates would run the same model twice);
  `CONFIRM_MODEL` must be a single non-blank ID; `REASONING_EFFORT` must be one of
  the CLI's accepted levels (`none|low|medium|high|xhigh|max`).
- These are **format/shape** checks only; whether a model is actually available
  on the Copilot plan can't be checked here and surfaces at the first `review`
  run (documented as a prerequisite).
- On success, emits the parsed reviewer-model list as a JSON array output for the
  `review` matrix.

**2. `prepare`** (`needs: config`; permissions: `contents: read`, `pull-requests: read`)

- Checks out the **default branch** (trusted), so `resolve-range.ts` cannot be
  tampered with by the PR.
- Resolves the PR context from the `workflow_run` event: `pr_number` and
  `head_sha` from `github.event.workflow_run.pull_requests`, falling back to
  `gh api repos/{owner}/{repo}/commits/{head_sha}/pulls`. (`workflow_run` carries
  no native PR context.)
- Runs `scripts/src/ai-review/resolve-range.ts`, which fetches the PR refs
  (`refs/pull/{n}/head` and the base ref) into the trusted checkout for git
  operations, reads existing PR reviews via
  `gh api repos/{owner}/{repo}/pulls/{n}/reviews`, parses the most recent
  `ai-review` marker for the previous `reviewed-head` and `verdict`, and outputs
  (alongside `pr_number`, `head_sha`, `base_sha`, `base_ref`):
  - `start_sha` = previous `reviewed-head`, when present and reachable.
  - `is_full` = `true` on the first review, or when `start_sha` is not an
    ancestor of `head_sha` (force-push / rebase, via `git merge-base --is-ancestor`).
  - `has_changes` = `false` when `start_sha == head_sha` (no new commits).
  - `carried_verdict` = the previous verdict, used only when `has_changes == false`.

**3. `review`** (`needs: [config, prepare]`, `if: needs.prepare.outputs.has_changes == 'true'`;
permissions: `contents: read`, `pull-requests: read`)

- Matrix over `config`'s reviewer-model list.
- Steps: checkout the **default branch** (trusted scripts + prompts) and install
  deps → checkout the PR head into `pr-head/` (`fetch-depth: 0`) and `bun install`
  there → install CLI (`npm install -g @github/copilot`) → general pass → security
  pass → upload reports. The agent runs with `-C pr-head` (the code under review),
  but its prompt comes from the trusted checkout.
  - **General pass** — prefer the built-in `/review`, scoped to the review range
    (`start_sha..head_sha`, or `base...head` when `is_full`), covering bugs,
    code quality, and structural design.
  - **Security pass** — a focused, model-pinned review prompt (injection, auth,
    secrets, crypto, SSRF, path traversal, dependency risk, etc.).
- Reviewers read project conventions (`CLAUDE.md`, `AGENTS.md`) and PR context
  (`gh pr view`, `gh pr diff`, review comments). When a reviewer suspects a bug it
  may **write and run a throwaway test** (e.g. `bun test`/`bun run typecheck`) to
  empirically confirm it, and include that validation in the report. Reviewers
  **must not post anything** to the PR — they only produce reports; files they
  create are scratch on the ephemeral runner.
- Allowed tools: `shell(git:*), shell(gh:*), shell(bun:*), read, write`, with
  `--secret-env-vars=COPILOT_GITHUB_TOKEN` so executing PR code cannot read the
  model token. Uploads `report-<model>-general.md` and `report-<model>-security.md`.

**4. `confirm`** (`needs: [config, prepare, review]`,
`if: needs.prepare.outputs.has_changes == 'true' && needs.review.result == 'success'`;
permissions: `contents: read`, `pull-requests: write`)

The model step only — no gating logic. Steps: checkout the **default branch**
(trusted prompt + scripts) and install deps → checkout the PR head into `pr-head/`
(`fetch-depth: 0`) and `bun install` there → download the reports → run the
confirmation agent (`CONFIRM_MODEL`) with `-C pr-head` and the trusted prompt,
which:

- Re-verifies each reported finding against the actual code/diff, **re-running a
  reviewer's repro test when one is provided**; discards anything it cannot confirm.
- Assigns severities (Critical / High / Medium / Low / nit).
- Posts **one PR review** via `gh api …/pulls/{n}/reviews` (`event: COMMENT`): a
  summary body (tag, reviewed range, severity table, and the hidden
  `reviewed-head` + `verdict` marker) plus inline comments on the exact changed
  lines. It self-corrects line-anchoring errors (retry, or move a finding to the
  summary if its line is not in the diff).
- Allowed tools: `shell(git:*), shell(gh:*), shell(bun:*), read, write`, with
  `--secret-env-vars=COPILOT_GITHUB_TOKEN`. The confirmation **prompt** is trusted
  (from the default branch), so the verdict marker cannot be PR-injected.

**5. `gate`** (`needs: [config, prepare, review, confirm]`;
`if: always() && github.event.workflow_run.event == 'pull_request' && github.event.workflow_run.conclusion == 'success'`;
permissions: `contents: read`, `pull-requests: write`, `issues: write`)

The single **required check** — decides the outcome and owns the label. Runs from
the **default branch** (trusted `gate.ts`). When the AI review runs at all (CI
passed), it runs regardless of upstream AI-job success/failure (`always()`) so the
check always reports a conclusion rather than hanging as a skipped-but-required
check. (When CI did **not** pass it is skipped along with the rest of the
workflow, and the red CI check blocks the PR instead.) Runs
`scripts/src/ai-review/gate.ts`:

- If any of `config`/`prepare`/`review`/`confirm` failed or was cancelled →
  **fail** (infra/incomplete; an incomplete review is never an approval). Existing
  labels are left untouched.
- Else if `has_changes == false` → verdict = `carried_verdict` (from `prepare`,
  no gh round-trip). If unreadable, fall back to failing rather than approving.
- Else → `read-verdict.ts` reads the `verdict=` marker back from the review
  `confirm` just posted; missing/unreadable → **fail safe**.
- Applies the matching PR label (`AI Approved` / `AI Need Change`, removing the
  other; both created if missing) and sets the exit code: `0` for `approved`,
  `1` for `need_change`.

### Severity gate

Only **Low / nit** findings pass. **Medium, High, Critical** block
(`AI Need Change`). Low/nit issues are still posted as non-blocking inline notes.

### Data flow

```
CI workflow completes on a PR
  └─ (CI conclusion != success) → AI review never triggers; gate never reports;
                                  red CI check blocks the PR
  └─ (CI conclusion == success) → AI review workflow_run fires
                                  (all jobs run TRUSTED default-branch scripts):
  └─ config:   validate COPILOT_CLI_TOKEN + model env values;
               emit reviewer-model matrix JSON
  └─ prepare (needs config): resolve PR (number, head_sha) from workflow_run;
               resolve-range.ts (fetch PR refs + gh reviews + git ancestry)
        → start_sha, head_sha, is_full, has_changes, carried_verdict
  └─ review (needs prepare, if has_changes; matrix = REVIEWER_MODELS):
        trusted checkout + PR head in pr-head/; agent runs -C pr-head
        /review pass      ─┐  (may write+run a repro test to
        security pass      ┤   confirm a bug, included in report)
                           └→ report-<model>-{general,security}.md (artifacts)
  └─ confirm (needs review, if has_changes && review==success):
        trusted checkout + PR head in pr-head/ → confirmation agent (CONFIRM_MODEL)
          reads reports → re-verifies code (re-runs repro tests)
          → posts 1 PR review (summary + inline comments + marker)
  └─ gate (needs all, always — only when CI passed) — REQUIRED CHECK:
        any upstream failed/cancelled → fail
        has_changes==false           → verdict = carried_verdict
        else                         → read-verdict.ts (marker from posted review)
        → apply "AI Approved"/"AI Need Change" label
        → exit 0 (approved) | 1 (need_change)
```

## Incremental review and the marker

Each posted summary carries `reviewed-head=<HEAD_SHA>`. The next run starts from
that SHA, so reviews chain commit-range to commit-range, and the PR accumulates a
visible history of one review per round. The marker is the only state; there is
no external store.

Fallbacks: no prior marker → review the full PR (`base...head`); marker SHA not
an ancestor of head (history rewrite) → review the full PR; head unchanged since
the marker → carry the prior verdict.

## Prompts

Reviewer and confirmation prompts are versioned files under
`scripts/src/ai-review/prompts/`, injected at runtime rather than embedded in YAML,
so they can be reviewed and tuned independently. The confirmation prompt
specifies the exact summary template (tag wording, severity table, marker) so
formatting stays consistent without a structured contract.

**Implementation-time validation:** confirm that `--model` actually governs the
model used by the built-in `/review` pass. If it does not, the general pass
falls back to a plain model-pinned review prompt of the same intent, preserving
the "two reviewers, different models" guarantee.

## Error handling

- A failed reviewer pass (model/network/quota) fails the matrix leg; `confirm` is
  then skipped and `gate` fails red — no auto-retry.
- A confirmation failure, or an unreadable verdict marker in `gate`, fails safe (red).
- A failed `gh` post is retried by the agent; if still failing, the `confirm` step
  fails and `gate` is red.
- An unset `COPILOT_CLI_TOKEN` or an invalid model env value (empty/duplicate
  `REVIEWER_MODELS`, blank `CONFIRM_MODEL`, or an unrecognized `REASONING_EFFORT`)
  is caught by the `config` job and fails the pipeline immediately with a clear
  message, before any checkout or model spend; a present-but-invalid token, or a
  model unavailable on the plan, surfaces later as a CLI error in `review`.
- Fork PRs (no secret access) are out of scope and documented as unsupported.
- When the `CI` workflow concludes non-success (failure/cancelled) the AI review
  does not trigger; `gate` reports nothing and the PR is blocked by the red CI
  check. Fixing CI and pushing re-runs CI, which re-triggers the AI review.

### Executing PR code

Reviewer and confirmation agents may run the PR's build/tests to validate
findings, which means executing (collaborator) code in CI. This is acceptable
because forks are excluded, the existing `ci.yml` already runs the same code, and
the repo is single-maintainer. Exposure is bounded by: read-only GitHub
permissions on the reviewer jobs, and `--secret-env-vars=COPILOT_GITHUB_TOKEN` so
the model token is stripped from any spawned shell environment.

### Trust model

Because `workflow_run` always runs the **default-branch** version of this
workflow, every gate-critical piece runs from a trusted checkout of the default
branch and is never the PR's copy: `check-config.ts`, `resolve-range.ts`,
`gate.ts`, and the reviewer/confirmation **prompt files**. This prevents a PR from
tampering with the verdict — e.g. rewriting `resolve-range` to emit
`has_changes=false, carried_verdict=approved`, or rewriting `confirm.md` to post a
fake `verdict=approved` marker — to bypass the gate. The PR's own code is checked
out separately into `pr-head/` purely as the subject of review; the agents run
with `-C pr-head` but always with trusted prompts and trusted orchestration.

## Code structure and testing

- New package **`packages/ai-review-core/`** holds the pure, side-effect-free
  logic, unit-tested with Vitest (`*.test.ts`), following the repo's
  small-focused-package convention (cf. `packages/free-ports`,
  `packages/markdown-frontmatter`):
  - parse PR-review bodies → latest `{reviewedHead, verdict}`;
  - compute `{startSha, headSha, isFull, hasChanges}` from SHAs + ancestry
    results;
  - render/parse the `ai-review` marker;
  - validate the model config (non-empty distinct `REVIEWER_MODELS`, non-blank
    `CONFIRM_MODEL`, allowed `REASONING_EFFORT`) → throws a clear error or returns
    the parsed reviewer-model list.
- Thin orchestrators in **`scripts/src/ai-review/`** (`check-config.ts`,
  `resolve-range.ts`, `read-verdict.ts`, `gate.ts`) wire `git`/`gh` via
  `node:child_process` to those pure functions and print GitHub Actions outputs /
  set exit codes — no tests, mirroring `scripts/src/with-free-ports.ts`. Node APIs
  only (no Bun-specific APIs).
- Integration is validated manually on a throwaway PR (documented checklist):
  first-run full review, incremental second push, force-push fallback,
  no-new-commits carry-forward, a reviewer writing a repro test to confirm a
  bug, and a deliberate Medium+ issue to confirm the red gate, inline comments,
  and the `AI Need Change` label.

## Prerequisites (maintainer, one-time)

1. Create a fine-grained PAT with the **"Copilot Requests"** permission; store it
   as repo secret **`COPILOT_CLI_TOKEN`**.
2. After the first green run, mark the `gate` check as **required** in branch
   protection for `main` so it blocks merges. (It only reports once `CI` has
   passed; on a red-CI commit it shows as pending, which is the desired block.)
3. Optionally set repository **Variables** (`AI_REVIEW_REVIEWER_MODELS`,
   `AI_REVIEW_CONFIRM_MODEL`, `AI_REVIEW_EFFORT`) to override the model defaults
   without editing the workflow; confirm the chosen models are available on the
   Copilot plan.
4. Keep the CI workflow named `CI`; the AI review's `workflow_run` trigger
   references it by that name.

The `AI Approved` / `AI Need Change` labels are created automatically by the
workflow if they do not yet exist, so no manual label setup is required.

## What is untouched

- The existing `.github/workflows/ci.yml` (lint/format/typecheck/test) and its
  `CI Result` gate are not modified. The AI review is a separate workflow that
  only _depends on_ CI's successful completion (by workflow name); it adds no
  jobs or steps to `ci.yml`.
- Production build/start and all application code.
