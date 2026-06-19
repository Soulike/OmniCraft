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
an open PR. It has three jobs: `prepare` resolves what to review, a matrix
`review` job runs the two model reviewers in parallel, and `confirm` reconciles
their reports and is the required gate.

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

### Models

Pinned as workflow `env` for one-place updates:

- Reviewer A: `gpt-5.5` at `--effort xhigh`.
- Reviewer B: `claude-opus-4.8` at `--effort xhigh`.
- Confirmation: `claude-opus-4.8` at `--effort xhigh`.

Availability depends on the maintainer's Copilot plan. Reviewers run with
`--context long_context` to tolerate larger diffs.

### Jobs

**1. `prepare`** (permissions: `contents: read`, `pull-requests: read`)

- **Preflight:** as the very first step, verify all required tokens are
  configured — fail fast with a clear message if the `COPILOT_CLI_TOKEN` secret
  is empty/unset (the built-in `GITHUB_TOKEN` is always present). This stops the
  pipeline before any checkout or model spend when the repo is misconfigured.
- `actions/checkout` with `fetch-depth: 0`, checking out
  `pull_request.head.sha` (the real head, not the synthetic merge commit).
- Runs `scripts/src/ai-review/resolve-range.ts`, which:
  - Reads existing PR reviews via `gh api repos/{owner}/{repo}/pulls/{n}/reviews`
    and parses the most recent body containing the `ai-review` marker to recover
    the previous `reviewed-head` SHA and `verdict`.
  - Computes outputs:
    - `head_sha` = current head.
    - `start_sha` = previous `reviewed-head`, when present and reachable.
    - `is_full` = `true` on the first review, or when `start_sha` is not an
      ancestor of `head_sha` (force-push / rebase, detected by
      `git merge-base --is-ancestor`).
    - `has_changes` = `false` when `start_sha == head_sha` (no new commits).
    - `carried_verdict` = the previous verdict, used only when
      `has_changes == false`.

**2. `review`** (`needs: prepare`, `if: needs.prepare.outputs.has_changes == 'true'`;
permissions: `contents: read`, `pull-requests: read`)

- Matrix over the two reviewer models.
- Installs the CLI (`npm install -g @github/copilot`), checks out head at
  `fetch-depth: 0`.
- Runs two passes, capturing stdout to files via `-s`:
  - **General pass** — prefer the built-in `/review`, scoped to the review range
    (`start_sha..head_sha`, or `base...head` when `is_full`), covering bugs,
    code quality, and structural design.
  - **Security pass** — a focused, model-pinned review prompt (injection, auth,
    secrets, crypto, SSRF, path traversal, dependency risk, etc.).
- Reviewers are instructed to read project conventions (`CLAUDE.md`,
  `AGENTS.md`) and PR context (`gh pr view`, `gh pr diff`, review comments), and
  to **not post anything** — they only produce reports.
- Allowed tools: `shell(git:*), shell(gh:*), read`. Uploads
  `report-<model>-general.md` and `report-<model>-security.md` as artifacts.

**3. `confirm`** (`needs: [prepare, review]`, `if: always()`;
permissions: `contents: read`, `pull-requests: write`, `issues: write`)

Always runs so the required check always reports a conclusion (avoids the
"skipped required check stays pending" pitfall). Logic:

- If `prepare` did not succeed → **fail red** (cannot determine scope safely).
- If `has_changes == false` → set the gate from `carried_verdict` (no model
  calls, no comment), and re-apply the matching PR label. If the carried verdict
  is unreadable, fall back to a full review instead of blocking.
- Else if any `review` matrix leg did not succeed → **fail red** ("review
  incomplete"); an incomplete review is never an approval.
- Else download the four reports and run the confirmation agent, which:
  - Re-verifies each reported finding against the actual code/diff; discards
    anything it cannot confirm.
  - Assigns severities (Critical / High / Medium / Low / nit).
  - Posts **one PR review** via `gh api …/pulls/{n}/reviews` (`event: COMMENT`):
    a summary body (tag, reviewed range, severity table, and the hidden
    `reviewed-head` + `verdict` marker) plus inline comments on the exact
    changed lines. It self-corrects line-anchoring errors (retry, or move a
    finding to the summary if its line is not in the diff).
  - Allowed tools: `shell(git:*), shell(gh:*), read, write`.
- After posting, `scripts/src/ai-review/read-verdict.ts` reads the just-posted
  review back via `gh`, extracts `verdict=`, **applies the matching PR label**
  (`AI Approved` or `AI Need Change`, removing the other; both labels are
  created if missing), and sets the job exit code: `0` for `approved`, `1` for
  `need_change`. Missing/unreadable verdict → **fail safe**. Labels are only
  touched when a real verdict is determined (posted or carried); infrastructure
  failures (incomplete/`prepare` failure) leave existing labels unchanged and
  rely on the red check.

### Severity gate

Only **Low / nit** findings pass. **Medium, High, Critical** block
(`AI Need Change`). Low/nit issues are still posted as non-blocking inline notes.

### Data flow

```
push to PR head
  └─ prepare:  preflight tokens (fail fast if COPILOT_CLI_TOKEN unset)
               resolve-range.ts (gh reviews + git ancestry)
        → start_sha, head_sha, is_full, has_changes, carried_verdict
  └─ review (matrix gpt-5.5 | claude-opus-4.8), only if has_changes:
        /review pass      ─┐
        security pass      ┤→ report-<model>-{general,security}.md (artifacts)
  └─ confirm (always):
        prepare failed     → gate = fail
        has_changes==false → gate = carried_verdict (re-apply label)
        any review failed  → gate = fail (incomplete)
        else → confirmation agent (claude-opus-4.8 xhigh)
                 reads 4 reports → re-verifies code → posts 1 PR review
                 (summary + inline comments + marker)
               read-verdict.ts → apply "AI Approved"/"AI Need Change" label
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

- A failed reviewer pass (model/network/quota) fails the matrix leg, which fails
  the gate red — no auto-retry.
- A confirmation failure, or an unreadable verdict marker, fails safe (red).
- A failed `gh` post is retried by the agent; if still failing, the step fails
  and the gate is red.
- An unset `COPILOT_CLI_TOKEN` is caught by the `prepare` preflight and fails the
  pipeline immediately with a clear message, before any checkout or model spend;
  a present-but-invalid token surfaces later as a CLI auth error in `review`.
- Fork PRs (no secret access) are out of scope and documented as unsupported.

## Code structure and testing

- New package **`packages/ai-review-core/`** holds the pure, side-effect-free
  logic, unit-tested with Vitest (`*.test.ts`), following the repo's
  small-focused-package convention (cf. `packages/free-ports`,
  `packages/markdown-frontmatter`):
  - parse PR-review bodies → latest `{reviewedHead, verdict}`;
  - compute `{startSha, headSha, isFull, hasChanges}` from SHAs + ancestry
    results;
  - render/parse the `ai-review` marker.
- Thin orchestrators in **`scripts/src/ai-review/`** (`resolve-range.ts`,
  `read-verdict.ts`) wire `git`/`gh` via `node:child_process` to those pure
  functions and print GitHub Actions outputs — no tests, mirroring
  `scripts/src/with-free-ports.ts`. Node APIs only (no Bun-specific APIs).
- Integration is validated manually on a throwaway PR (documented checklist):
  first-run full review, incremental second push, force-push fallback,
  no-new-commits carry-forward, and a deliberate Medium+ issue to confirm the
  red gate and inline comments.

## Prerequisites (maintainer, one-time)

1. Create a fine-grained PAT with the **"Copilot Requests"** permission; store it
   as repo secret **`COPILOT_CLI_TOKEN`**.
2. After the first green run, mark the `confirm` check as **required** in branch
   protection for `main` so the gate blocks merges.
3. Confirm `gpt-5.5` and `claude-opus-4.8` are available on the Copilot plan;
   otherwise update the workflow `env` model IDs.

The `AI Approved` / `AI Need Change` labels are created automatically by the
workflow if they do not yet exist, so no manual label setup is required.

## What is untouched

- The existing `.github/workflows/ci.yml` (lint/format/typecheck/test) and its
  `CI Result` gate — the AI review is a separate, independent workflow and check.
- Production build/start and all application code.
