# Roll Back Deterministic Dedup → Agent-Driven Dedup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the deterministic known-issue dedup machinery (GraphQL fetch → rendered list → file → prompt injection) and instead instruct the reviewer agents to fetch and skip already-raised, still-open findings themselves. This also closes the gate-flip hole (PR #295 review comment 3): with no orchestrator-supplied "don't re-report this" list, the gate no longer flips a blocking verdict to approved just because reviewers were told to stay silent.

**Architecture:** Delete `fetchUnresolvedBotIssues` (GraphQL) and `renderKnownIssues`/`KnownIssue` (pure). `resolve-range.ts` stops fetching/writing the known-issues file and stops emitting `known_issues_file`. The workflow drops the `Upload known issues` (prepare) and `Download known issues` + `$KNOWN` injection (review) steps. The reviewer prompts gain a self-service instruction: read the PR's existing **unresolved** bot review comments via `gh`, and don't re-report a finding that's already open.

**Tech Stack:** TypeScript (Node APIs only), Vitest, Bun workspaces, GitHub Actions, GitHub Copilot CLI, `gh` CLI (the agents already have `shell(gh:*)` / full `shell`).

**Why this change (do not relitigate):**

- The deterministic list is redundant work: reviewers already inspect existing comments on their own, and we are doing the same fetch twice.
- The deterministic "reviewer was told not to report X" mechanism is what made the gate flip a `need_change` to `approved` on a trivial push (verified: `decideGate({hasChanges:true, carriedVerdict:'need_change', postedVerdict:'approved'}) → exit 0`). Removing the orchestrator-driven suppression removes that coupling — dedup becomes a best-effort judgment the agent makes, not a guarantee the orchestrator enforces, so a real open finding can still be re-surfaced and keep blocking.
- Agent-driven dedup tolerates being imperfect; the deterministic version created a correctness obligation we then had to reason about against the gate.

**Reference — current footprint to remove/change:**

- `packages/ai-review-core/src/known-issues.ts` + `known-issues.test.ts` — DELETE.
- `packages/ai-review-core/src/index.ts` — remove the two `known-issues` exports.
- `scripts/src/ai-review/known-issues.ts` — DELETE.
- `scripts/src/ai-review/resolve-range.ts` — remove fetch/render/writeFile + `known_issues_file` output.
- `.github/workflows/ai-review.yml` — remove `Upload known issues`, `Download known issues`, and the `$KNOWN` prompt lines.
- `scripts/src/ai-review/prompts/review-general.md` + `review-security.md` — replace the deterministic dedup rule with a self-service one.

**Conventions (from CLAUDE.md):** Bun runtime; tests via `bun run --filter <pkg> test` (NEVER `bun test`); Node APIs only; never `any`; early-return; conventional-commit messages (commitlint rejects non-standard types).

---

### Task 1: Remove the pure `renderKnownIssues` / `KnownIssue` from the core package

**Files:**

- Delete: `packages/ai-review-core/src/known-issues.ts`
- Delete: `packages/ai-review-core/src/known-issues.test.ts`
- Modify: `packages/ai-review-core/src/index.ts`

- [ ] **Step 1: Delete the two files**

```bash
git rm packages/ai-review-core/src/known-issues.ts packages/ai-review-core/src/known-issues.test.ts
```

- [ ] **Step 2: Remove the exports from the index**

Edit `packages/ai-review-core/src/index.ts` and delete exactly these two lines:

```typescript
export type {KnownIssue} from './known-issues.js';
export {renderKnownIssues} from './known-issues.js';
```

Leave all other exports (config, gate, marker, range) intact.

- [ ] **Step 3: Run the core tests**

Run: `bun run --filter '@omnicraft/ai-review-core' test`
Expected: PASS — the known-issues suite is gone (4 fewer tests), the rest (marker, range, config, gate) still green. No "cannot find module" errors.

- [ ] **Step 4: Typecheck the core package**

Run: `bun run --filter '@omnicraft/ai-review-core' typecheck`
Expected: passes (no dangling re-export).

- [ ] **Step 5: Commit**

```bash
git add packages/ai-review-core/src/index.ts
git commit -m "refactor: drop renderKnownIssues from ai-review-core"
```

(The `git rm` from Step 1 is already staged; `git add` stages the index edit.)

---

### Task 2: Delete the GraphQL fetcher and de-wire `resolve-range`

`scripts/src/ai-review/known-issues.ts` (the `fetchUnresolvedBotIssues` GraphQL helper) is no longer needed. `resolve-range.ts` must stop importing it, stop rendering/writing the file, and stop emitting `known_issues_file`.

**Files:**

- Delete: `scripts/src/ai-review/known-issues.ts`
- Modify: `scripts/src/ai-review/resolve-range.ts`

- [ ] **Step 1: Delete the GraphQL fetcher**

```bash
git rm scripts/src/ai-review/known-issues.ts
```

- [ ] **Step 2: Rewrite `resolve-range.ts`**

Replace the ENTIRE contents of `scripts/src/ai-review/resolve-range.ts` with:

```typescript
import {parseLatestMarker, resolveReviewRange} from '@omnicraft/ai-review-core';

import {readBotReviewBodies} from './reviews.js';
import {requireEnv, setOutput} from './shared/gha.js';
import {createGitHubClient} from './shared/octokit.js';
import {requirePrNumber, requireSha} from './shared/validate.js';

async function main(): Promise<void> {
  const client = createGitHubClient();
  const prNumber = Number(requirePrNumber(requireEnv('PR_NUMBER')));
  const headSha = requireSha('PR_HEAD_SHA', requireEnv('PR_HEAD_SHA'));

  const previousMarker = parseLatestMarker(
    await readBotReviewBodies(client, prNumber),
  );
  const range = resolveReviewRange({headSha, previousMarker});

  setOutput('pr_number', String(prNumber));
  setOutput('head_sha', headSha);
  setOutput('has_changes', String(range.hasChanges));
  setOutput('carried_verdict', range.carriedVerdict ?? '');

  console.log(
    `PR #${prNumber}: head=${headSha} hasChanges=${range.hasChanges} ` +
      `carried=${range.carriedVerdict ?? '-'}`,
  );
}

await main();
```

- [ ] **Step 3: Typecheck the scripts package**

Run: `bun run --filter '@omnicraft/scripts' typecheck`
Expected: passes — no reference to the deleted `known-issues.js`, `renderKnownIssues`, `writeFileSync`, or `RUNNER_TEMP`.

- [ ] **Step 4: Lint**

Run: `bunx eslint scripts/src/ai-review/`
Expected: clean — no unused imports, no missing modules.

- [ ] **Step 5: Commit**

```bash
git add scripts/src/ai-review/resolve-range.ts
git commit -m "refactor: resolve-range no longer fetches or emits known issues"
```

---

### Task 3: Remove the known-issues steps from the workflow

The `prepare` job uploads the file as an artifact; the `review` job downloads it and injects `$KNOWN` into both passes. Remove all of that. The base-fetch, report-file, and matrix logic stay.

**Files:**

- Modify: `.github/workflows/ai-review.yml`

- [ ] **Step 1: Remove the `Upload known issues` step from `prepare`**

In `.github/workflows/ai-review.yml`, delete this step from the `prepare` job (the step block beginning `- name: Upload known issues`):

```yaml
- name: Upload known issues
  uses: actions/upload-artifact@v7
  with:
    name: known-issues
    path: ${{ steps.range.outputs.known_issues_file }}
    if-no-files-found: error
```

After removal, the `prepare` job's last step is `Resolve range`.

- [ ] **Step 2: Remove the `Download known issues` step from `review`**

In the `review` job, delete this step block (beginning `- name: Download known issues`):

```yaml
- name: Download known issues
  uses: actions/download-artifact@v8
  with:
    name: known-issues
    path: known-issues-dir
```

- [ ] **Step 3: Remove the `$KNOWN` injection from the review pass prompt**

In the `review` job's `Review pass` step, the `run:` block currently starts with:

```bash
          KNOWN="$(cat known-issues-dir/known-issues.md)"
          PROMPT="$(cat "$GITHUB_WORKSPACE/scripts/src/ai-review/prompts/review-$PASS.md")

          Repository: $GH_REPO
          PR number: $PR_NUMBER
          Review the full diff of this PR against its base: run
          \`git diff $BASE_SHA...HEAD\` (three-dot) inside pr-head.

          Issues already raised on this PR and still open (do NOT re-report these):
          $KNOWN

          Report file: $REPORT_FILE"
```

Replace that opening with (drop the `KNOWN=` line and the two known-issues prompt lines):

```bash
          PROMPT="$(cat "$GITHUB_WORKSPACE/scripts/src/ai-review/prompts/review-$PASS.md")

          Repository: $GH_REPO
          PR number: $PR_NUMBER
          Review the full diff of this PR against its base: run
          \`git diff $BASE_SHA...HEAD\` (three-dot) inside pr-head.

          Report file: $REPORT_FILE"
```

Everything after `Report file: $REPORT_FILE"` (the `copilot ...` invocation and the report-non-empty guard) stays unchanged.

- [ ] **Step 4: Validate the YAML parses and check the known-issues references are gone**

Run:

```bash
cd packages/markdown-frontmatter && bun -e "const fs=require('node:fs');const{parse}=require('yaml');const d=parse(fs.readFileSync('../../.github/workflows/ai-review.yml','utf8'));console.log('OK jobs:',Object.keys(d.jobs).join(','))" && cd ../..
grep -n 'known.issues\|known_issues\|KNOWN' .github/workflows/ai-review.yml || echo "no known-issues references"
```

Expected: `OK jobs: config,prepare,review,confirm,gate` and `no known-issues references`.

- [ ] **Step 5: Format check**

Run: `bun run format:check`
Expected: passes (run `bun run format` then re-check if Prettier reformats the YAML).

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/ai-review.yml
git commit -m "refactor: drop known-issues artifact and prompt injection from workflow"
```

---

### Task 4: Switch the reviewer prompts to self-service dedup

Replace the deterministic "the prompt lists issues already raised" rule with an instruction for the agent to fetch the PR's existing unresolved bot comments itself and avoid duplicating them.

**Files:**

- Modify: `scripts/src/ai-review/prompts/review-general.md`
- Modify: `scripts/src/ai-review/prompts/review-security.md`

- [ ] **Step 1: Update the general prompt's dedup rule**

In `scripts/src/ai-review/prompts/review-general.md`, under `## Hard rules`, replace this bullet:

```markdown
- **Do not re-report already-raised issues.** The prompt lists issues already
  raised on this PR and still open (`path:line — summary`). If a problem you find
  is substantially the same as one on that list (same place, same underlying
  issue), do NOT report it again — it is already tracked. Only report new issues.
```

with:

```markdown
- **Do not re-report already-raised issues.** Before finalizing, check the PR's
  existing review comments (e.g. `gh pr view` / `gh api repos/$GH_REPO/pulls/$PR_NUMBER/comments`)
  and skip any finding that is substantially the same as one already raised and
  still open (same place, same underlying issue). Only report new issues.
```

- [ ] **Step 2: Update the general prompt's context note**

In the same file, under `## Context you may read`, the line currently reads:

```markdown
- Existing PR review comments (do not repeat points already raised).
```

Leave it as-is — it already points the agent at existing comments and now reinforces the hard rule above. (No change needed; this step is a confirmation that the two are consistent.)

- [ ] **Step 3: Update the security prompt's dedup rule**

In `scripts/src/ai-review/prompts/review-security.md`, under `## Hard rules`, replace this bullet:

```markdown
- **Do not re-report already-raised issues.** The prompt lists issues already
  raised on this PR and still open. If your finding is substantially the same as
  one already listed, do NOT report it again. Only report new issues.
```

with:

```markdown
- **Do not re-report already-raised issues.** Before finalizing, check the PR's
  existing review comments (e.g. `gh pr view` / `gh api repos/$GH_REPO/pulls/$PR_NUMBER/comments`)
  and skip any finding substantially the same as one already raised and still
  open. Only report new issues.
```

- [ ] **Step 4: Format check**

Run: `bun run format:check`
Expected: passes (run `bun run format` first if needed).

- [ ] **Step 5: Commit**

```bash
git add scripts/src/ai-review/prompts/review-general.md scripts/src/ai-review/prompts/review-security.md
git commit -m "docs: reviewers self-check existing comments instead of an injected list"
```

---

### Task 5: Full-suite verification + README

Confirm everything is green and the README no longer claims the deterministic dedup behavior.

**Files:**

- Modify: `scripts/src/ai-review/README.md`

- [ ] **Step 1: Run the core tests**

Run: `bun run --filter '@omnicraft/ai-review-core' test`
Expected: PASS — `marker`, `range`, `config`, `gate` suites (no `known-issues` suite).

- [ ] **Step 2: Typecheck both packages**

Run:

```bash
bun run --filter '@omnicraft/ai-review-core' typecheck && \
bun run --filter '@omnicraft/scripts' typecheck
```

Expected: both pass.

- [ ] **Step 3: Lint and format**

Run: `bunx eslint scripts/src/ai-review/ packages/ai-review-core/src/ && bun run format:check`
Expected: both clean.

- [ ] **Step 4: Confirm no dangling known-issues references**

Run:

```bash
grep -rn 'known-issues\|known_issues\|renderKnownIssues\|fetchUnresolvedBotIssues\|KnownIssue' packages/ai-review-core/src scripts/src/ai-review .github/workflows/ai-review.yml || echo "clean"
```

Expected: prints `clean`.

- [ ] **Step 5: Update the README dedup checklist item**

In `scripts/src/ai-review/README.md`, the manual checklist has a `**Dedup:**` item describing the old behavior. Replace it with:

```markdown
- [ ] **Dedup:** leave a prior bot finding unresolved, push a trivial change;
      confirm reviewers (which now read existing PR comments themselves) avoid
      re-reporting the already-open finding, while a newly introduced issue is
      still reported.
```

If the README has any other sentence asserting an orchestrator-built known-issues list is injected into reviewers, soften it to "reviewers check existing PR comments themselves." (Search the file for `known` to be sure.)

- [ ] **Step 6: Format check**

Run: `bun run format:check`
Expected: passes.

- [ ] **Step 7: Commit**

```bash
git add scripts/src/ai-review/README.md
git commit -m "docs: document agent-driven dedup"
```

---

## Plan complete

Removes the deterministic dedup machinery in five focused commits: the pure renderer (Task 1), the GraphQL fetcher + resolve-range de-wiring (Task 2), the workflow artifact/injection steps (Task 3), the reviewer prompts switched to self-service dedup (Task 4), and verification + README (Task 5). The verdict marker, `resolveReviewRange` (head-unchanged short-circuit), full-diff review, parallel passes, and the gate logic are all untouched. The gate-flip coupling disappears because reviewers are no longer told by the orchestrator to suppress a specific finding.

Execute task-by-task with the required sub-skill; do not mark a task complete until its verification step passes. Then reply to and resolve PR #295 review comment 3 (thread the gate-flip finding) noting the dedup mechanism was removed.
