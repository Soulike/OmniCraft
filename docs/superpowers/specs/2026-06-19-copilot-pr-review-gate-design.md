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

A dedicated workflow, `.github/workflows/ai-review.yml`, runs on every push to
an open PR. It has five single-purpose jobs: `config` validates configuration
and emits the model matrix, `prepare` resolves what to review, a matrix `review`
job runs the model reviewers in parallel, `confirm` reconciles their reports and
posts the PR review, and `gate` decides the outcome and is the required check.
Branching lives in `needs`/`if` between jobs, not inside them.

The model never emits structured JSON that another step must parse. Reviewers
write Markdown reports (passed between jobs as plain-text artifacts). The
confirmation agent reads those reports, re-verifies against the real code, and
posts its review directly via `gh`. The only machine-readable token is embedded
in the summary the agent posts:

```
<!-- ai-review reviewed-head=<HEAD_SHA> verdict=approved|need_change -->
```

### Trigger and concurrency

```yaml
on:
  pull_request:
    types: [opened, synchronize, reopened]
concurrency:
  group: ai-review-${{ github.event.pull_request.number }}
  cancel-in-progress: true
```

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

**1. `config`** (no checkout; permissions: none)

Runs `scripts/src/ai-review/check-config.ts`, which fails fast with a clear
message — before any checkout or model spend — when the repo is misconfigured:

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

- `actions/checkout` with `fetch-depth: 0`, checking out `pull_request.head.sha`
  (the real head, not the synthetic merge commit).
- Runs `scripts/src/ai-review/resolve-range.ts`, which reads existing PR reviews
  via `gh api repos/{owner}/{repo}/pulls/{n}/reviews`, parses the most recent
  `ai-review` marker for the previous `reviewed-head` and `verdict`, and outputs:
  - `head_sha` = current head.
  - `start_sha` = previous `reviewed-head`, when present and reachable.
  - `is_full` = `true` on the first review, or when `start_sha` is not an
    ancestor of `head_sha` (force-push / rebase, via `git merge-base --is-ancestor`).
  - `has_changes` = `false` when `start_sha == head_sha` (no new commits).
  - `carried_verdict` = the previous verdict, used only when `has_changes == false`.

**3. `review`** (`needs: [config, prepare]`, `if: needs.prepare.outputs.has_changes == 'true'`;
permissions: `contents: read`, `pull-requests: read`)

- Matrix over `config`'s reviewer-model list.
- Steps: checkout head (`fetch-depth: 0`) → install CLI (`npm install -g @github/copilot`)
  → `./.github/actions/setup` (bun install) for a working toolchain → general
  pass → security pass → upload reports.
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

The model step only — no gating logic. Steps: checkout head (`fetch-depth: 0`) →
`./.github/actions/setup` → download the four reports → run the confirmation
agent (`CONFIRM_MODEL`), which:

- Re-verifies each reported finding against the actual code/diff, **re-running a
  reviewer's repro test when one is provided**; discards anything it cannot confirm.
- Assigns severities (Critical / High / Medium / Low / nit).
- Posts **one PR review** via `gh api …/pulls/{n}/reviews` (`event: COMMENT`): a
  summary body (tag, reviewed range, severity table, and the hidden
  `reviewed-head` + `verdict` marker) plus inline comments on the exact changed
  lines. It self-corrects line-anchoring errors (retry, or move a finding to the
  summary if its line is not in the diff).
- Allowed tools: `shell(git:*), shell(gh:*), shell(bun:*), read, write`, with
  `--secret-env-vars=COPILOT_GITHUB_TOKEN`.

**5. `gate`** (`needs: [config, prepare, review, confirm]`, `if: always()`;
permissions: `contents: read`, `pull-requests: write`, `issues: write`)

The single **required check** — decides the outcome and owns the label. Always
runs so the check always reports a conclusion (avoids the "skipped required check
stays pending" pitfall). Runs `scripts/src/ai-review/gate.ts`:

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
push to PR head
  └─ config:   validate COPILOT_CLI_TOKEN + model env values;
               emit reviewer-model matrix JSON
  └─ prepare (needs config): checkout + resolve-range.ts (gh reviews + git ancestry)
        → start_sha, head_sha, is_full, has_changes, carried_verdict
  └─ review (needs prepare, if has_changes; matrix = REVIEWER_MODELS):
        checkout + setup (bun install)
        /review pass      ─┐  (may write+run a repro test to
        security pass      ┤   confirm a bug, included in report)
                           └→ report-<model>-{general,security}.md (artifacts)
  └─ confirm (needs review, if has_changes && review==success):
        checkout + setup → confirmation agent (CONFIRM_MODEL, xhigh)
          reads 4 reports → re-verifies code (re-runs repro tests)
          → posts 1 PR review (summary + inline comments + marker)
  └─ gate (needs all, always) — REQUIRED CHECK:
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

### Executing PR code

Reviewer and confirmation agents may run the PR's build/tests to validate
findings, which means executing (collaborator) code in CI. This is acceptable
because forks are excluded, the existing `ci.yml` already runs the same code, and
the repo is single-maintainer. Exposure is bounded by: read-only GitHub
permissions on the reviewer jobs, and `--secret-env-vars=COPILOT_GITHUB_TOKEN` so
the model token is stripped from any spawned shell environment.

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
   protection for `main` so it blocks merges.
3. Optionally set repository **Variables** (`AI_REVIEW_REVIEWER_MODELS`,
   `AI_REVIEW_CONFIRM_MODEL`, `AI_REVIEW_EFFORT`) to override the model defaults
   without editing the workflow; confirm the chosen models are available on the
   Copilot plan.

The `AI Approved` / `AI Need Change` labels are created automatically by the
workflow if they do not yet exist, so no manual label setup is required.

## What is untouched

- The existing `.github/workflows/ci.yml` (lint/format/typecheck/test) and its
  `CI Result` gate — the AI review is a separate, independent workflow and check.
- Production build/start and all application code.
