# Full-Diff Review + Known-Issue Dedup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the AI review gate's fragile incremental-range logic with a full-PR-diff review against `origin/main`, keep a cheap "head unchanged → skip" short-circuit, and feed reviewers a list of already-raised (unresolved) findings so they don't re-report known issues.

**Architecture:** The pure `resolveReviewRange` collapses from a four-branch incremental/ancestry decision to a single "skip if head unchanged, else review" decision (no more `startSha`/`isFull`/ancestry). Reviewers always diff `origin/<base>...HEAD` (three-dot, so `main`-only commits and merge-brought-in commits are excluded by merge-base). A new pure `renderKnownIssues` formats the unresolved bot review threads (fetched via GraphQL) into a compact `path:line — body` list that the orchestrator writes to a file and injects into the reviewer prompts. The verdict marker (`reviewed-head` + `verdict`) is retained: `reviewed-head` now only drives the skip short-circuit and serves as documentation.

**Tech Stack:** TypeScript (Node APIs only), Vitest, Bun workspaces, `@octokit/rest` (REST + GraphQL), GitHub Actions (`pull_request`), GitHub Copilot CLI.

**Key decisions already made (do not relitigate):**

- Full review every round; basis is `origin/<base-ref>` (three-dot diff).
- Keep a short-circuit: if `previousMarker.reviewedHead === headSha`, skip review and carry the prior verdict.
- Keep the marker (both `reviewedHead` and `verdict`) — it drives the short-circuit and documents history.
- Dedup is done by the **reviewers** (not just confirm): they receive the unresolved-known-issues list and must not re-report a finding already on it.
- Only the gate bot's own (`github-actions[bot]`) unresolved threads count as "already raised". Resolved threads are excluded (a resolved finding either was fixed or was force-resolved — re-reporting the latter is correct).

**Reference patterns in this repo:**

- Pure tested logic: `packages/ai-review-core/src/*.ts` + `*.test.ts` (Vitest).
- Thin orchestrators (no tests, side-effectful): `scripts/src/ai-review/*.ts`.
- Business-agnostic helpers live in `scripts/src/ai-review/shared/`.
- Octokit client factory: `scripts/src/ai-review/shared/octokit.ts` (exports `createGitHubClient(): GitHubClient` with `{octokit, owner, repo}`; `octokit.graphql` and `octokit.paginate` are both available).

**Conventions (from CLAUDE.md):**

- Bun is the runtime/package manager; run tests with `bun run --filter <pkg> test` (Vitest), NEVER `bun test`.
- Node.js APIs only; never `any` (use `unknown` + narrowing); early-return style.
- Add deps only via `bun add`.

---

### Task 1: Simplify the `resolveReviewRange` pure function

`resolveReviewRange` currently has four branches (first-run, force-push fallback, head-unchanged carry, incremental) and depends on `startIsAncestorOfHead`. Under full-review it collapses to: head unchanged since the marker → skip (carry verdict); otherwise → review. The `startSha`/`isFull` outputs and the `startIsAncestorOfHead` input are removed.

**Files:**

- Modify: `packages/ai-review-core/src/range.ts`
- Test: `packages/ai-review-core/src/range.test.ts`

- [ ] **Step 1: Rewrite the test**

Replace the ENTIRE contents of `packages/ai-review-core/src/range.test.ts` with:

```typescript
import {describe, expect, it} from 'vitest';

import {resolveReviewRange} from './range.js';

describe('resolveReviewRange', () => {
  it('reviews on the first run (no prior marker)', () => {
    const result = resolveReviewRange({
      headSha: 'aaaaaaa',
      previousMarker: null,
    });
    expect(result).toEqual({hasChanges: true, carriedVerdict: null});
  });

  it('reviews when the head changed since the prior marker', () => {
    const result = resolveReviewRange({
      headSha: 'bbbbbbb',
      previousMarker: {reviewedHead: 'aaaaaaa', verdict: 'approved'},
    });
    expect(result).toEqual({hasChanges: true, carriedVerdict: null});
  });

  it('skips and carries the prior verdict when head is unchanged', () => {
    const result = resolveReviewRange({
      headSha: 'aaaaaaa',
      previousMarker: {reviewedHead: 'aaaaaaa', verdict: 'approved'},
    });
    expect(result).toEqual({hasChanges: false, carriedVerdict: 'approved'});
  });

  it('carries a need_change verdict when head is unchanged', () => {
    const result = resolveReviewRange({
      headSha: 'aaaaaaa',
      previousMarker: {reviewedHead: 'aaaaaaa', verdict: 'need_change'},
    });
    expect(result).toEqual({hasChanges: false, carriedVerdict: 'need_change'});
  });
});
```

- [ ] **Step 2: Run the test, confirm it FAILS**

Run: `bun run --filter '@omnicraft/ai-review-core' test`
Expected: FAIL — the current `resolveReviewRange` returns objects with `startSha`/`isFull`, so `toEqual({hasChanges, carriedVerdict})` fails (and the input no longer has `startIsAncestorOfHead`).

- [ ] **Step 3: Rewrite the implementation**

Replace the ENTIRE contents of `packages/ai-review-core/src/range.ts` with:

```typescript
import type {ReviewMarker, Verdict} from './marker.js';

/** Inputs to {@link resolveReviewRange}; all side effects resolved upstream. */
export interface ResolveRangeInput {
  /** Current PR head SHA. */
  readonly headSha: string;
  /** Marker from the most recent prior review, or `null` on the first run. */
  readonly previousMarker: ReviewMarker | null;
}

/** Whether to review this round, and any verdict carried when skipping. */
export interface ReviewRange {
  /** Whether the PR head changed since the last review (so a review is due). */
  readonly hasChanges: boolean;
  /** Prior verdict to carry forward; only set when `hasChanges` is `false`. */
  readonly carriedVerdict: Verdict | null;
}

/**
 * Decides whether a full review is due. Reviews on the first run and whenever
 * the head SHA differs from the last reviewed head; when the head is unchanged
 * there is nothing new to review, so the prior verdict carries forward. The diff
 * range itself is always the full `base...head` and is computed by the workflow,
 * not here.
 */
export function resolveReviewRange(input: ResolveRangeInput): ReviewRange {
  const {headSha, previousMarker} = input;

  if (previousMarker !== null && previousMarker.reviewedHead === headSha) {
    return {hasChanges: false, carriedVerdict: previousMarker.verdict};
  }

  return {hasChanges: true, carriedVerdict: null};
}
```

- [ ] **Step 4: Run the test, confirm it PASSES**

Run: `bun run --filter '@omnicraft/ai-review-core' test`
Expected: PASS — all four `resolveReviewRange` cases green; the rest of the core suite unaffected.

- [ ] **Step 5: Typecheck the core package**

Run: `bun run --filter '@omnicraft/ai-review-core' typecheck`
Expected: passes. (The `index.ts` re-export of `ResolveRangeInput`/`ReviewRange` still resolves — the type names are unchanged, only their fields changed.)

- [ ] **Step 6: Commit**

```bash
git add packages/ai-review-core/src/range.ts packages/ai-review-core/src/range.test.ts
git commit -m "refactor: collapse resolveReviewRange to a head-unchanged skip check"
```

---

### Task 2: Add the `renderKnownIssues` pure function

The orchestrator will fetch unresolved bot review threads (Task 4) and needs to render them into a compact list for the reviewer prompt. The rendering is pure and testable; the fetching (GraphQL) is not. Put the type + renderer in the core package.

**Files:**

- Create: `packages/ai-review-core/src/known-issues.ts`
- Create: `packages/ai-review-core/src/known-issues.test.ts`
- Modify: `packages/ai-review-core/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/ai-review-core/src/known-issues.test.ts`:

```typescript
import {describe, expect, it} from 'vitest';

import {renderKnownIssues} from './known-issues.js';

describe('renderKnownIssues', () => {
  it('returns an explicit empty marker when there are no issues', () => {
    expect(renderKnownIssues([])).toBe('(none)');
  });

  it('renders one line per issue as `path:line — first body line`', () => {
    const out = renderKnownIssues([
      {path: 'src/a.ts', line: 12, body: 'Off-by-one in the loop bound.'},
      {path: 'src/b.ts', line: 3, body: 'Unvalidated input reaches argv.'},
    ]);
    expect(out).toBe(
      '- src/a.ts:12 — Off-by-one in the loop bound.\n' +
        '- src/b.ts:3 — Unvalidated input reaches argv.',
    );
  });

  it('uses only the first non-empty line of a multi-line body', () => {
    const out = renderKnownIssues([
      {path: 'src/a.ts', line: 5, body: '\nTitle line\n\nmore detail here'},
    ]);
    expect(out).toBe('- src/a.ts:5 — Title line');
  });

  it('renders (no line) when line is null', () => {
    const out = renderKnownIssues([
      {path: 'src/a.ts', line: null, body: 'File-level concern.'},
    ]);
    expect(out).toBe('- src/a.ts:(no line) — File-level concern.');
  });
});
```

- [ ] **Step 2: Run the test, confirm it FAILS**

Run: `bun run --filter '@omnicraft/ai-review-core' test`
Expected: FAIL — `Cannot find module './known-issues.js'`.

- [ ] **Step 3: Write the implementation**

Create `packages/ai-review-core/src/known-issues.ts`:

```typescript
/** A previously-raised, still-unresolved review finding. */
export interface KnownIssue {
  /** File path the finding was anchored to. */
  readonly path: string;
  /** Line number, or `null` for a file-level / summary finding. */
  readonly line: number | null;
  /** The finding's comment body (may be multi-line). */
  readonly body: string;
}

/** First non-empty, trimmed line of a body, or `''` if there is none. */
function firstLine(body: string): string {
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return '';
}

/**
 * Renders known issues as a compact Markdown list (`- path:line — summary`),
 * one per line, using only the first line of each body to stay token-cheap.
 * Returns the literal `(none)` when the list is empty so the prompt can state
 * that explicitly.
 */
export function renderKnownIssues(issues: readonly KnownIssue[]): string {
  if (issues.length === 0) {
    return '(none)';
  }
  return issues
    .map((issue) => {
      const where = issue.line === null ? '(no line)' : String(issue.line);
      return `- ${issue.path}:${where} — ${firstLine(issue.body)}`;
    })
    .join('\n');
}
```

- [ ] **Step 4: Export from the package index**

Edit `packages/ai-review-core/src/index.ts` — add these two lines (keep all existing exports; the linter will re-sort on commit):

```typescript
export type {KnownIssue} from './known-issues.js';
export {renderKnownIssues} from './known-issues.js';
```

- [ ] **Step 5: Run the test, confirm it PASSES**

Run: `bun run --filter '@omnicraft/ai-review-core' test`
Expected: PASS — all `renderKnownIssues` cases green.

- [ ] **Step 6: Typecheck**

Run: `bun run --filter '@omnicraft/ai-review-core' typecheck`
Expected: passes.

- [ ] **Step 7: Commit**

```bash
git add packages/ai-review-core/src/known-issues.ts packages/ai-review-core/src/known-issues.test.ts packages/ai-review-core/src/index.ts
git commit -m "feat: add renderKnownIssues for the reviewer known-issue list"
```

---

### Task 3: Fetch unresolved bot review threads (GraphQL)

Add a side-effectful helper that pulls this PR's review threads via GraphQL,
keeps only the unresolved ones authored by the gate bot, and maps them to
`KnownIssue[]`. GraphQL is required because the resolved/unresolved state lives
on `reviewThreads.isResolved`, which the REST reviews/comments endpoints do not
expose. This file has no unit tests (it does live I/O); the pure rendering it
feeds is tested in Task 2.

**Files:**

- Create: `scripts/src/ai-review/known-issues.ts`

- [ ] **Step 1: Write the helper**

Create `scripts/src/ai-review/known-issues.ts`:

```typescript
import type {KnownIssue} from '@omnicraft/ai-review-core';

import type {GitHubClient} from './shared/octokit.js';

/** Login whose review threads count as already-raised gate findings. */
const REVIEW_AUTHOR = 'github-actions[bot]';

interface ThreadComment {
  readonly author: {readonly login: string} | null;
  readonly path: string;
  readonly line: number | null;
  readonly body: string;
}

interface ReviewThread {
  readonly isResolved: boolean;
  readonly comments: {readonly nodes: readonly ThreadComment[]};
}

interface ThreadsPage {
  readonly repository: {
    readonly pullRequest: {
      readonly reviewThreads: {
        readonly pageInfo: {
          readonly hasNextPage: boolean;
          readonly endCursor: string | null;
        };
        readonly nodes: readonly ReviewThread[];
      };
    };
  };
}

const THREADS_QUERY = `
  query ($owner: String!, $repo: String!, $num: Int!, $cursor: String) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $num) {
        reviewThreads(first: 100, after: $cursor) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            isResolved
            comments(first: 1) {
              nodes {
                author {
                  login
                }
                path
                line
                body
              }
            }
          }
        }
      }
    }
  }
`;

/**
 * Returns the still-unresolved review findings previously raised by the gate
 * bot on this PR, as {@link KnownIssue}[]. Resolved threads and threads authored
 * by anyone else are excluded. Paginates through all review threads.
 */
export async function fetchUnresolvedBotIssues(
  client: GitHubClient,
  prNumber: number,
): Promise<KnownIssue[]> {
  const {octokit, owner, repo} = client;
  const issues: KnownIssue[] = [];
  let cursor: string | null = null;

  for (;;) {
    const page: ThreadsPage = await octokit.graphql(THREADS_QUERY, {
      owner,
      repo,
      num: prNumber,
      cursor,
    });
    const {pageInfo, nodes} = page.repository.pullRequest.reviewThreads;

    for (const thread of nodes) {
      if (thread.isResolved) {
        continue;
      }
      const comment = thread.comments.nodes[0];
      if (comment === undefined || comment.author?.login !== REVIEW_AUTHOR) {
        continue;
      }
      issues.push({path: comment.path, line: comment.line, body: comment.body});
    }

    if (!pageInfo.hasNextPage) {
      return issues;
    }
    cursor = pageInfo.endCursor;
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run --filter '@omnicraft/scripts' typecheck`
Expected: passes (the `@omnicraft/ai-review-core` `KnownIssue` type resolves; `octokit.graphql` is typed as returning `unknown`/generic, and the explicit `ThreadsPage` annotation narrows it).

- [ ] **Step 3: Commit**

```bash
git add scripts/src/ai-review/known-issues.ts
git commit -m "feat: fetch unresolved bot review threads via GraphQL"
```

> Note: this helper is validated end-to-end on a real PR in Task 8, not by unit tests.

---

### Task 4: Rewrite the `resolve-range` orchestrator

Adapt the orchestrator to the simplified `resolveReviewRange` (no `start_sha`/`is_full`), drop the git-ancestry work and the `git fetch` (the diff range is now computed in the workflow, and the review job fetches base itself — Task 6), and additionally emit a `known_issues_file` output: it writes the rendered known-issues list to a file and outputs the path so the review job can inject it.

**Files:**

- Modify: `scripts/src/ai-review/resolve-range.ts` (full rewrite)

- [ ] **Step 1: Rewrite the orchestrator**

Replace the ENTIRE contents of `scripts/src/ai-review/resolve-range.ts` with:

```typescript
import {writeFileSync} from 'node:fs';

import {
  parseLatestMarker,
  renderKnownIssues,
  resolveReviewRange,
} from '@omnicraft/ai-review-core';

import {fetchUnresolvedBotIssues} from './known-issues.js';
import {requireEnv, setOutput} from './shared/gha.js';
import {createGitHubClient} from './shared/octokit.js';
import {readBotReviewBodies} from './reviews.js';
import {requirePrNumber, requireSha} from './shared/validate.js';

async function main(): Promise<void> {
  const client = createGitHubClient();
  const prNumber = Number(requirePrNumber(requireEnv('PR_NUMBER')));
  const headSha = requireSha('PR_HEAD_SHA', requireEnv('PR_HEAD_SHA'));

  const previousMarker = parseLatestMarker(
    await readBotReviewBodies(client, prNumber),
  );
  const range = resolveReviewRange({headSha, previousMarker});

  // Render the still-open findings so reviewers can skip already-raised ones,
  // and hand the path to the review job via an output.
  const knownIssues = await fetchUnresolvedBotIssues(client, prNumber);
  const knownIssuesFile = `${requireEnv('RUNNER_TEMP')}/known-issues.md`;
  writeFileSync(knownIssuesFile, renderKnownIssues(knownIssues));

  setOutput('pr_number', String(prNumber));
  setOutput('head_sha', headSha);
  setOutput('has_changes', String(range.hasChanges));
  setOutput('carried_verdict', range.carriedVerdict ?? '');
  setOutput('known_issues_file', knownIssuesFile);

  console.log(
    `PR #${prNumber}: head=${headSha} hasChanges=${range.hasChanges} ` +
      `carried=${range.carriedVerdict ?? '-'} knownIssues=${knownIssues.length}`,
  );
}

await main();
```

- [ ] **Step 2: Typecheck**

Run: `bun run --filter '@omnicraft/scripts' typecheck`
Expected: passes.

- [ ] **Step 3: Verify `git.ts` and `requireGitRef` are now unused, and remove them**

The old `resolve-range` was the only TypeScript caller of `run`/`isAncestor` (from `shared/git.ts`) and of `requireGitRef`/`requireSha`'s git-ref path. Check:

Run: `grep -rn "from './shared/git.js'\|requireGitRef\|isAncestor\|\\brun(" scripts/src/ai-review/`
Expected: the only matches are the definitions themselves (in `shared/git.ts` and `shared/validate.ts`) — no remaining callers. (`requireSha` is still used by `resolve-range`; keep it.)

If `shared/git.ts` has no remaining importers, delete it:

```bash
git rm scripts/src/ai-review/shared/git.ts
```

Then edit `scripts/src/ai-review/shared/validate.ts` and delete the now-unused `requireGitRef` function (the `export function requireGitRef(...) { ... }` block and its `GIT_REF_PATTERN` regex constant if that constant is used only by it). Leave `requireRepo`, `requirePrNumber`, `requireSha` intact.

- [ ] **Step 4: Typecheck + lint after removal**

Run: `bun run --filter '@omnicraft/scripts' typecheck && bunx eslint scripts/src/ai-review/`
Expected: both pass with no unused-symbol or missing-import errors. If ESLint reports `requireGitRef`/`GIT_REF_PATTERN` still referenced somewhere, restore only what is actually used.

- [ ] **Step 5: Commit**

```bash
git add -A scripts/src/ai-review/
git commit -m "refactor: resolve-range emits known-issues file and drops incremental range"
```

---

### Task 5: Update the workflow (`ai-review.yml`)

Several changes: (1) `prepare` passes only the env the new `resolve-range` needs, drops `base_sha`/`base_ref`/`start_sha`/`is_full`, and uploads the known-issues file as an artifact; (2) the `review` job gains a `pass` matrix dimension (so general and security run as separate parallel jobs), fetches `origin/<base>` for the full three-dot diff, injects the known-issues list, and uploads one report artifact per `(model, pass)`; (3) the `confirm` job scopes its report download to `reports-*` (so it does not pull in the `known-issues` artifact) and loses the removed `start_sha`/`base_sha` references. `gate.ts` itself is unchanged (it already reads `HAS_CHANGES`/`CARRIED_VERDICT`/`POSTED_VERDICT` only).

**Files:**

- Modify: `.github/workflows/ai-review.yml`

- [ ] **Step 1: Replace the `prepare` job**

In `.github/workflows/ai-review.yml`, replace the entire `prepare:` job block with:

```yaml
prepare:
  name: Resolve review range
  needs: config
  runs-on: ubuntu-latest
  permissions:
    contents: read
    pull-requests: read
  outputs:
    pr_number: ${{ steps.range.outputs.pr_number }}
    head_sha: ${{ steps.range.outputs.head_sha }}
    has_changes: ${{ steps.range.outputs.has_changes }}
    carried_verdict: ${{ steps.range.outputs.carried_verdict }}
  steps:
    - uses: actions/checkout@v6
    - uses: ./.github/actions/setup
    - name: Resolve range
      id: range
      run: bun scripts/src/ai-review/resolve-range.ts
      env:
        GH_TOKEN: ${{ github.token }}
        GH_REPO: ${{ github.repository }}
        PR_NUMBER: ${{ github.event.pull_request.number }}
        PR_HEAD_SHA: ${{ github.event.pull_request.head.sha }}
```

> Note: `known_issues_file` is exposed only as a **step** output (`steps.range.outputs.known_issues_file`), not a job output, because the file lives under `RUNNER_TEMP`, which is per-job and not shared across jobs. The upload step below (still in the `prepare` job) reads that step output to publish the file as an artifact; the `review` job consumes it by downloading the artifact, not by reading a path.

- [ ] **Step 2: Upload the known-issues file from `prepare`**

Because `RUNNER_TEMP` is not shared across jobs, add an upload step to `prepare` (right after the `Resolve range` step) so the `review` job can download it:

```yaml
- name: Upload known issues
  uses: actions/upload-artifact@v4
  with:
    name: known-issues
    path: ${{ steps.range.outputs.known_issues_file }}
    if-no-files-found: error
```

- [ ] **Step 3: Replace the entire `review` job — add a `pass` matrix dimension so general/security run in parallel**

Replace the ENTIRE `review:` job (from `  review:` up to but not including `  confirm:`) with the following. This adds a `pass` dimension to the matrix so `(model × pass)` runs as separate parallel jobs (e.g. 2 models × 2 passes = 4 parallel jobs), collapses the two near-identical pass steps into one parameterized step, fetches the base for the three-dot diff, injects the known-issues list, and keeps the report-non-empty guard:

```yaml
review:
  name: Review (${{ matrix.model }} / ${{ matrix.pass }})
  needs: [config, prepare]
  if: needs.prepare.outputs.has_changes == 'true'
  runs-on: ubuntu-latest
  permissions:
    contents: read
    pull-requests: read
  strategy:
    fail-fast: false
    matrix:
      model: ${{ fromJSON(needs.config.outputs.reviewer_models_json) }}
      pass: [general, security]
  steps:
    - uses: actions/checkout@v6
    - uses: ./.github/actions/setup
    - name: Checkout PR head
      uses: actions/checkout@v6
      with:
        ref: ${{ needs.prepare.outputs.head_sha }}
        path: pr-head
        fetch-depth: 0
    - name: Fetch base for diff range
      run: git -C pr-head fetch --no-tags origin "${BASE_REF}"
      env:
        BASE_REF: ${{ github.event.pull_request.base.ref }}
    - name: Install deps in pr-head
      run: bun install --frozen-lockfile
      working-directory: pr-head
    - name: Install Copilot CLI
      run: npm install -g @github/copilot
    - name: Download known issues
      uses: actions/download-artifact@v4
      with:
        name: known-issues
        path: known-issues-dir
    - name: Review pass
      run: |
        KNOWN="$(cat known-issues-dir/known-issues.md)"
        PROMPT="$(cat "$GITHUB_WORKSPACE/scripts/src/ai-review/prompts/review-$PASS.md")

        Repository: $GH_REPO
        PR number: $PR_NUMBER
        Review the full diff of this PR against its base: run
        \`git diff origin/$BASE_REF...HEAD\` (three-dot) inside pr-head.

        Issues already raised on this PR and still open (do NOT re-report these):
        $KNOWN

        Report file: $REPORT_FILE"
        copilot --model "$MODEL" --effort "$REASONING_EFFORT" \
          --context long_context \
          --allow-tool 'shell(git:*),shell(gh:*),shell(bun:*),read,write' \
          --allow-all-urls \
          --secret-env-vars COPILOT_GITHUB_TOKEN \
          --add-dir "$GITHUB_WORKSPACE" \
          -C pr-head \
          -p "$PROMPT"
        if [ ! -s "$REPORT_FILE" ]; then
          echo "::error::Reviewer did not write a non-empty report to $REPORT_FILE"
          exit 1
        fi
      env:
        MODEL: ${{ matrix.model }}
        PASS: ${{ matrix.pass }}
        COPILOT_GITHUB_TOKEN: ${{ secrets.COPILOT_CLI_TOKEN }}
        GH_TOKEN: ${{ github.token }}
        GH_REPO: ${{ github.repository }}
        PR_NUMBER: ${{ needs.prepare.outputs.pr_number }}
        BASE_REF: ${{ github.event.pull_request.base.ref }}
        REPORT_FILE: ${{ github.workspace }}/report-${{ matrix.model }}-${{ matrix.pass }}.md
    - name: Upload report
      uses: actions/upload-artifact@v4
      with:
        name: reports-${{ matrix.model }}-${{ matrix.pass }}
        path: report-${{ matrix.model }}-${{ matrix.pass }}.md
        if-no-files-found: error
```

> Note on artifact names: each `(model, pass)` job now uploads its own artifact `reports-<model>-<pass>`. The `confirm` job already downloads with `merge-multiple: true` (Task 5 leaves that unchanged), so all four report files land together in its `reports/` directory regardless of how many artifacts there are.

- [ ] **Step 4: Update the `confirm` job's prompt range line**

In the `confirm:` job's `Confirm and post` step, the prompt currently includes a `Reviewed range: $REVIEW_RANGE` line and the step `env:` sets `REVIEW_RANGE` from `start_sha`/`base_sha`. Replace that env var and prompt line. Change the prompt block's range line to:

```
          Reviewed range: full PR diff (origin/$BASE_REF...HEAD)
```

and in that step's `env:`, remove the `REVIEW_RANGE:` line and add:

```yaml
BASE_REF: ${{ github.event.pull_request.base.ref }}
```

(Keep `COPILOT_GITHUB_TOKEN`, `GH_TOKEN`, `GH_REPO`, `PR_NUMBER`, `HEAD_SHA`.)

- [ ] **Step 5: Scope the `confirm` job's report download to `reports-*` only**

The `prepare` job now also publishes a `known-issues` artifact. The `confirm` job's `Download reports` step downloads **all** artifacts (`merge-multiple: true`, no name filter), which would pull `known-issues.md` into the `reports/` directory alongside the real reports. Add a `pattern` so it only grabs the per-pass report artifacts. In the `confirm:` job, replace the `Download reports` step with:

```yaml
- name: Download reports
  uses: actions/download-artifact@v4
  with:
    pattern: reports-*
    path: reports
    merge-multiple: true
```

- [ ] **Step 6: Validate the YAML parses**

Run:

```bash
cd packages/markdown-frontmatter && bun -e "const fs=require('node:fs');const{parse}=require('yaml');const d=parse(fs.readFileSync('../../.github/workflows/ai-review.yml','utf8'));console.log('OK jobs:',Object.keys(d.jobs).join(','));console.log('prepare.outputs:',Object.keys(d.jobs.prepare.outputs).join(','));console.log('review.matrix keys:',Object.keys(d.jobs.review.strategy.matrix).join(','))" && cd ../..
```

Expected: `OK jobs: config,prepare,review,confirm,gate`; `prepare.outputs: pr_number,head_sha,has_changes,carried_verdict`; `review.matrix keys: model,pass`.

- [ ] **Step 7: Grep for stale references**

Run: `grep -n 'start_sha\|is_full\|base_sha\|REVIEW_RANGE\|base_ref' .github/workflows/ai-review.yml`
Expected: NO matches (all removed). If any remain, remove them.

- [ ] **Step 8: Format check**

Run: `bun run format:check`
Expected: passes (run `bun run format` then re-check if Prettier reformats the YAML).

- [ ] **Step 9: Commit**

```bash
git add .github/workflows/ai-review.yml
git commit -m "refactor: full PR diff review, parallel passes, known-issues injection"
```

---

### Task 6: Update the reviewer prompts for full-diff + dedup

The reviewer prompts currently say "Review only the commit range you are given (the new commits since the last review)". Under full review they should review the whole PR diff, and they must honor the known-issues list.

**Files:**

- Modify: `scripts/src/ai-review/prompts/review-general.md`
- Modify: `scripts/src/ai-review/prompts/review-security.md`

- [ ] **Step 1: Update the general prompt's intro**

In `scripts/src/ai-review/prompts/review-general.md`, replace the opening paragraph (the lines from `You are one of several expert reviewers` through `not the whole PR.` — i.e. the sentence that scopes to "only the commit range") with:

```markdown
You are one of several expert reviewers on a pull request. Review the **full
diff of this PR against its base branch** (the prompt tells you the exact
`git diff origin/<base>...HEAD` command to run). Focus on correctness and design:
```

- [ ] **Step 2: Add a dedup rule to the general prompt's Hard rules**

In `scripts/src/ai-review/prompts/review-general.md`, under the `## Hard rules` section, add this bullet as the first item:

```markdown
- **Do not re-report already-raised issues.** The prompt lists issues already
  raised on this PR and still open (`path:line — summary`). If a problem you find
  is substantially the same as one on that list (same place, same underlying
  issue), do NOT report it again — it is already tracked. Only report new issues.
```

- [ ] **Step 3: Update the security prompt's intro**

In `scripts/src/ai-review/prompts/review-security.md`, replace the opening paragraph (the sentence scoping to "only the given commit range") with:

```markdown
You are a security specialist reviewing the **full diff of this PR against its
base branch** (the prompt tells you the exact `git diff origin/<base>...HEAD`
command to run). Hunt for security-relevant defects:
```

- [ ] **Step 4: Add a dedup rule to the security prompt's Hard rules**

In `scripts/src/ai-review/prompts/review-security.md`, under the `## Hard rules` section, add this bullet as the first item:

```markdown
- **Do not re-report already-raised issues.** The prompt lists issues already
  raised on this PR and still open. If your finding is substantially the same as
  one already listed, do NOT report it again. Only report new issues.
```

- [ ] **Step 5: Format check**

Run: `bun run format:check`
Expected: passes (run `bun run format` first if needed).

- [ ] **Step 6: Commit**

```bash
git add scripts/src/ai-review/prompts/review-general.md scripts/src/ai-review/prompts/review-security.md
git commit -m "docs: reviewers cover the full PR diff and skip already-raised issues"
```

---

### Task 7: Full-suite verification + README update

Confirm the whole change is green and the README reflects the new behavior (full review, dedup, no incremental range).

**Files:**

- Modify: `scripts/src/ai-review/README.md`

- [ ] **Step 1: Run the core tests**

Run: `bun run --filter '@omnicraft/ai-review-core' test`
Expected: PASS — `marker`, `range` (4 cases), `config`, `gate`, `known-issues` (4 cases) suites all green.

- [ ] **Step 2: Typecheck both packages**

Run:

```bash
bun run --filter '@omnicraft/ai-review-core' typecheck && \
bun run --filter '@omnicraft/scripts' typecheck
```

Expected: both pass.

- [ ] **Step 3: Lint and format**

Run: `bunx eslint scripts/src/ai-review/ packages/ai-review-core/src/ && bun run format:check`
Expected: both clean (run `bun run format` to fix formatting if needed).

- [ ] **Step 4: Confirm no stray `any`, Bun APIs, or dead incremental references**

Run:

```bash
grep -rnE ': any\b|Bun\.' packages/ai-review-core/src scripts/src/ai-review || echo "clean"
grep -rn 'isAncestor\|startSha\|isFull\|start_sha\|is_full' packages/ai-review-core/src scripts/src/ai-review .github/workflows/ai-review.yml || echo "no incremental remnants"
```

Expected: first prints `clean`; second prints `no incremental remnants`.

- [ ] **Step 5: Update the README**

In `scripts/src/ai-review/README.md`, update two things:

1. The opening description — change "reviews each push to an open PR" to make explicit it is a **full-diff** review:

Replace the first paragraph's first sentence with:

```markdown
A `pull_request`-triggered gate that reviews the **full diff of each open PR
against its base branch** with the GitHub Copilot CLI, posts one PR review per
round, and blocks merges on confirmed Medium+ findings.
```

2. Replace the **Manual integration checklist** section's incremental-specific items with full-review + dedup items. Replace the whole `## Manual integration checklist (run once on a throwaway PR)` list with:

```markdown
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
```

- [ ] **Step 6: Format check**

Run: `bun run format:check`
Expected: passes.

- [ ] **Step 7: Commit**

```bash
git add scripts/src/ai-review/README.md
git commit -m "docs: document full-diff review and known-issue dedup"
```

---

## Plan complete

All decisions covered: `resolveReviewRange` collapsed to a head-unchanged skip
check (Task 1); `renderKnownIssues` pure renderer (Task 2); GraphQL fetch of
unresolved bot threads (Task 3); `resolve-range` orchestrator rewritten to emit
the known-issues file and drop incremental/ancestry/`git.ts` (Task 4); workflow
switched to full three-dot diff vs base + a `pass` matrix dimension so
general/security run in parallel + known-issues injection + report guard
retained (Task 5); reviewer prompts updated for full-diff + dedup (Task 6);
verification + README (Task 7). The verdict marker is retained for the
short-circuit and as documentation; the gate's fail-closed logic is unchanged.

Execute task-by-task with the required sub-skill; do not mark a task complete
until its verification step passes. End-to-end behavior (full diff range, GraphQL
fetch, dedup) is validated manually on a throwaway PR per the README checklist —
there is no automated test for the live workflow.
