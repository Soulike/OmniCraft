# Copilot CLI PR Review Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an automated, incremental, model-driven PR code-review gate: a `workflow_run`-triggered GitHub Actions workflow whose deterministic logic (marker parsing, range resolution, config validation, verdict gating) lives in a unit-tested package, with model invocation and PR posting delegated to the GitHub Copilot CLI.

**Architecture:** A new pure, side-effect-free package `@omnicraft/ai-review-core` (Vitest-tested) holds four logic units: marker render/parse, review-range computation, model-config validation, and the gate decision. Thin orchestrators under `scripts/src/ai-review/` wire `git`/`gh` (via `node:child_process`) to those pure functions and emit GitHub Actions outputs / exit codes. Versioned prompt files under `scripts/src/ai-review/prompts/` are injected into the CLI at runtime. A five-job workflow `.github/workflows/ai-review.yml` (`config` → `prepare` → `review` matrix → `confirm` → `gate`) runs entirely from the trusted default-branch checkout, with the PR's code checked out separately into `pr-head/` as the subject of review.

**Tech Stack:** TypeScript (Node APIs only), Vitest, Bun workspaces, GitHub Actions (`workflow_run`), GitHub Copilot CLI (`@github/copilot`), `gh` CLI.

**Reference patterns in this repo:**

- Pure tested package: `packages/markdown-frontmatter/`, `packages/free-ports/`.
- Thin orchestrator (no tests): `scripts/src/with-free-ports.ts`.
- Existing CI workflow (named `CI`): `.github/workflows/ci.yml`; composite setup: `.github/actions/setup/action.yml`.
- Spec: `docs/superpowers/specs/2026-06-19-copilot-pr-review-gate-design.md`.

**Conventions to honor (from CLAUDE.md):**

- Package manager is **Bun**; run package scripts via `bun run <script>` and filtered via `bun run --filter`.
- **Node.js APIs only** in code (`node:child_process`, `node:fs`); never Bun-specific APIs.
- Tests run with **Vitest** via `bun run test` (never `bun test`).
- `never use any` — use `unknown` + narrowing. Early-return style for `if`.
- Add a dependency only via `bun add`, never by hand-editing a version into `package.json`.

---

### Task 1: Scaffold `@omnicraft/ai-review-core` package

**Files:**

- Create: `packages/ai-review-core/package.json`
- Create: `packages/ai-review-core/tsconfig.json`
- Create: `packages/ai-review-core/eslint.config.js`
- Create: `packages/ai-review-core/src/index.ts`

- [ ] **Step 1: Create `package.json`**

Create `packages/ai-review-core/package.json` (mirrors `packages/markdown-frontmatter/package.json`):

```json
{
  "name": "@omnicraft/ai-review-core",
  "description": "Pure logic for the AI PR review gate: marker parsing, range resolution, config validation, and gating",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@config/eslint": "workspace:^",
    "@config/typescript": "workspace:^",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

Create `packages/ai-review-core/tsconfig.json` (identical to the other packages):

```json
{
  "extends": "@config/typescript/package",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist"
  }
}
```

- [ ] **Step 3: Create `eslint.config.js`**

Create `packages/ai-review-core/eslint.config.js` (matches `packages/markdown-frontmatter/eslint.config.js`):

```javascript
import eslintConfig from '@config/eslint';

export default [...eslintConfig.recommendedTypeScript];
```

- [ ] **Step 4: Create placeholder `src/index.ts`**

Create `packages/ai-review-core/src/index.ts`:

```typescript
// Exports are added in subsequent tasks.
export {};
```

- [ ] **Step 5: Install dependencies**

Run: `bun install`
Expected: lockfile updated, `@omnicraft/ai-review-core` linked into the workspace, no errors.

- [ ] **Step 6: Verify typecheck**

Run: `bun run --filter '@omnicraft/ai-review-core' typecheck`
Expected: passes with no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/ai-review-core/ bun.lock
git commit -m "chore: scaffold @omnicraft/ai-review-core package"
```

---

### Task 2: Marker render/parse (`marker.ts`)

The only machine-readable token in the system. Format (single line, embedded in a posted review summary):

```
<!-- ai-review reviewed-head=<HEAD_SHA> verdict=approved|need_change -->
```

`renderMarker` produces it; `parseMarker` extracts one from a body; `parseLatestMarker` scans an ordered list of review bodies (oldest→newest, as `gh` returns them) and returns the marker from the most recent body that contains one.

**Files:**

- Create: `packages/ai-review-core/src/marker.ts`
- Test: `packages/ai-review-core/src/marker.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/ai-review-core/src/marker.test.ts`:

```typescript
import {describe, expect, it} from 'vitest';

import {parseLatestMarker, parseMarker, renderMarker} from './marker.js';

describe('renderMarker', () => {
  it('renders the exact marker comment', () => {
    expect(renderMarker({reviewedHead: 'abc123', verdict: 'approved'})).toBe(
      '<!-- ai-review reviewed-head=abc123 verdict=approved -->',
    );
  });

  it('renders need_change verdicts', () => {
    expect(
      renderMarker({reviewedHead: 'deadbeef', verdict: 'need_change'}),
    ).toBe('<!-- ai-review reviewed-head=deadbeef verdict=need_change -->');
  });
});

describe('parseMarker', () => {
  it('parses a marker embedded in a larger body', () => {
    const body = [
      '## AI Review',
      '',
      'Looks good.',
      '',
      '<!-- ai-review reviewed-head=abc123 verdict=approved -->',
    ].join('\n');
    expect(parseMarker(body)).toEqual({
      reviewedHead: 'abc123',
      verdict: 'approved',
    });
  });

  it('returns null when no marker is present', () => {
    expect(parseMarker('Just a normal comment.')).toBeNull();
  });

  it('returns null for a malformed verdict value', () => {
    expect(
      parseMarker('<!-- ai-review reviewed-head=abc verdict=maybe -->'),
    ).toBeNull();
  });

  it('round-trips with renderMarker', () => {
    const marker = {reviewedHead: 'f00ba7', verdict: 'need_change'} as const;
    expect(parseMarker(renderMarker(marker))).toEqual(marker);
  });
});

describe('parseLatestMarker', () => {
  it('returns null for an empty list', () => {
    expect(parseLatestMarker([])).toBeNull();
  });

  it('returns null when no body carries a marker', () => {
    expect(parseLatestMarker(['hello', 'world'])).toBeNull();
  });

  it('returns the marker from the most recent body that has one', () => {
    const bodies = [
      '<!-- ai-review reviewed-head=oldsha verdict=need_change -->',
      '<!-- ai-review reviewed-head=newsha verdict=approved -->',
      'A later human comment with no marker.',
    ];
    expect(parseLatestMarker(bodies)).toEqual({
      reviewedHead: 'newsha',
      verdict: 'approved',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run --filter '@omnicraft/ai-review-core' test`
Expected: FAIL — `Cannot find module './marker.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/ai-review-core/src/marker.ts`:

```typescript
/** Verdict emitted by the confirmation agent. */
export type Verdict = 'approved' | 'need_change';

/** Machine-readable marker embedded in each posted review summary. */
export interface ReviewMarker {
  /** HEAD SHA the review covered. */
  readonly reviewedHead: string;
  /** Whether the review approved the change or requires a change. */
  readonly verdict: Verdict;
}

const MARKER_REGEX =
  /<!--\s*ai-review\s+reviewed-head=(\S+)\s+verdict=(approved|need_change)\s*-->/;

/** Renders a {@link ReviewMarker} as its canonical HTML-comment string. */
export function renderMarker(marker: ReviewMarker): string {
  return `<!-- ai-review reviewed-head=${marker.reviewedHead} verdict=${marker.verdict} -->`;
}

/**
 * Extracts the first valid `ai-review` marker from a single review body.
 * Returns `null` when the body contains no well-formed marker.
 */
export function parseMarker(body: string): ReviewMarker | null {
  const match = MARKER_REGEX.exec(body);
  if (!match) {
    return null;
  }
  return {
    reviewedHead: match[1] as string,
    verdict: match[2] as Verdict,
  };
}

/**
 * Scans review bodies in submission order (oldest first) and returns the
 * marker from the most recent body that carries one, or `null` if none do.
 */
export function parseLatestMarker(
  bodies: readonly string[],
): ReviewMarker | null {
  for (let index = bodies.length - 1; index >= 0; index -= 1) {
    const marker = parseMarker(bodies[index] as string);
    if (marker) {
      return marker;
    }
  }
  return null;
}
```

- [ ] **Step 4: Export from the package index**

Replace the contents of `packages/ai-review-core/src/index.ts`:

```typescript
export type {ReviewMarker, Verdict} from './marker.js';
export {parseLatestMarker, parseMarker, renderMarker} from './marker.js';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun run --filter '@omnicraft/ai-review-core' test`
Expected: PASS — all `marker` tests green.

- [ ] **Step 6: Commit**

```bash
git add packages/ai-review-core/src/marker.ts packages/ai-review-core/src/marker.test.ts packages/ai-review-core/src/index.ts
git commit -m "feat: add ai-review marker render/parse"
```

---

### Task 3: Review-range computation (`range.ts`)

Pure function: given the current `headSha`, the PR `baseSha`, the previous marker (or `null`), and the boolean result of a `git merge-base --is-ancestor` check, decide what to review. All git/gh side effects happen in the orchestrator (Task 8); this unit only does the branching arithmetic.

**Files:**

- Create: `packages/ai-review-core/src/range.ts`
- Test: `packages/ai-review-core/src/range.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/ai-review-core/src/range.test.ts`:

```typescript
import {describe, expect, it} from 'vitest';

import {resolveReviewRange} from './range.js';

describe('resolveReviewRange', () => {
  it('is a full review on the first run (no prior marker)', () => {
    const result = resolveReviewRange({
      headSha: 'head1',
      baseSha: 'base1',
      previousMarker: null,
      startIsAncestorOfHead: false,
    });
    expect(result).toEqual({
      startSha: null,
      isFull: true,
      hasChanges: true,
      carriedVerdict: null,
    });
  });

  it('is incremental when the prior reviewed-head is an ancestor of head', () => {
    const result = resolveReviewRange({
      headSha: 'head2',
      baseSha: 'base1',
      previousMarker: {reviewedHead: 'mid1', verdict: 'approved'},
      startIsAncestorOfHead: true,
    });
    expect(result).toEqual({
      startSha: 'mid1',
      isFull: false,
      hasChanges: true,
      carriedVerdict: null,
    });
  });

  it('falls back to a full review when history was rewritten', () => {
    // prior reviewed-head is no longer reachable from head (force-push/rebase)
    const result = resolveReviewRange({
      headSha: 'head3',
      baseSha: 'base1',
      previousMarker: {reviewedHead: 'gone1', verdict: 'need_change'},
      startIsAncestorOfHead: false,
    });
    expect(result).toEqual({
      startSha: null,
      isFull: true,
      hasChanges: true,
      carriedVerdict: null,
    });
  });

  it('carries the prior verdict when head is unchanged since the marker', () => {
    const result = resolveReviewRange({
      headSha: 'samehead',
      baseSha: 'base1',
      previousMarker: {reviewedHead: 'samehead', verdict: 'approved'},
      startIsAncestorOfHead: true,
    });
    expect(result).toEqual({
      startSha: 'samehead',
      isFull: false,
      hasChanges: false,
      carriedVerdict: 'approved',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run --filter '@omnicraft/ai-review-core' test`
Expected: FAIL — `Cannot find module './range.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/ai-review-core/src/range.ts`:

```typescript
import type {ReviewMarker, Verdict} from './marker.js';

/** Inputs to {@link resolveReviewRange}; all side effects resolved upstream. */
export interface ResolveRangeInput {
  /** Current PR head SHA. */
  readonly headSha: string;
  /** PR base SHA (merge target). */
  readonly baseSha: string;
  /** Marker from the most recent prior review, or `null` on the first run. */
  readonly previousMarker: ReviewMarker | null;
  /**
   * Result of `git merge-base --is-ancestor <previousMarker.reviewedHead> <headSha>`.
   * Meaningless (and ignored) when `previousMarker` is `null`.
   */
  readonly startIsAncestorOfHead: boolean;
}

/** What to review this round. */
export interface ReviewRange {
  /** SHA to diff from, or `null` for a full `base...head` review. */
  readonly startSha: string | null;
  /** Whether this is a full-PR review (first run or history rewrite). */
  readonly isFull: boolean;
  /** Whether there are new commits to review. */
  readonly hasChanges: boolean;
  /** Prior verdict to carry forward; only set when `hasChanges` is `false`. */
  readonly carriedVerdict: Verdict | null;
}

/**
 * Decides the review range from SHAs, the prior marker, and a precomputed
 * ancestry check. Full review on first run or when the prior reviewed-head is
 * not an ancestor of head (force-push/rebase); incremental otherwise; and when
 * head is unchanged, no new commits and the prior verdict carries forward.
 */
export function resolveReviewRange(input: ResolveRangeInput): ReviewRange {
  const {headSha, previousMarker, startIsAncestorOfHead} = input;

  if (previousMarker === null) {
    return {
      startSha: null,
      isFull: true,
      hasChanges: true,
      carriedVerdict: null,
    };
  }

  if (!startIsAncestorOfHead) {
    return {
      startSha: null,
      isFull: true,
      hasChanges: true,
      carriedVerdict: null,
    };
  }

  if (previousMarker.reviewedHead === headSha) {
    return {
      startSha: headSha,
      isFull: false,
      hasChanges: false,
      carriedVerdict: previousMarker.verdict,
    };
  }

  return {
    startSha: previousMarker.reviewedHead,
    isFull: false,
    hasChanges: true,
    carriedVerdict: null,
  };
}
```

- [ ] **Step 4: Export from the package index**

Edit `packages/ai-review-core/src/index.ts`, adding after the marker exports:

```typescript
export type {ResolveRangeInput, ReviewRange} from './range.js';
export {resolveReviewRange} from './range.js';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun run --filter '@omnicraft/ai-review-core' test`
Expected: PASS — `range` and `marker` suites green.

- [ ] **Step 6: Commit**

```bash
git add packages/ai-review-core/src/range.ts packages/ai-review-core/src/range.test.ts packages/ai-review-core/src/index.ts
git commit -m "feat: add ai-review range resolution"
```

---

### Task 4: Model-config validation (`config.ts`)

Pure validation of the workflow's model env values. Throws a clear `Error` on bad input; returns the parsed reviewer-model list on success. `REVIEWER_MODELS` is comma-separated and must yield distinct, non-blank IDs; `CONFIRM_MODEL` must be a single non-blank ID; `REASONING_EFFORT` must be one of the CLI's accepted levels.

**Files:**

- Create: `packages/ai-review-core/src/config.ts`
- Test: `packages/ai-review-core/src/config.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/ai-review-core/src/config.test.ts`:

```typescript
import {describe, expect, it} from 'vitest';

import {REASONING_EFFORTS, validateReviewConfig} from './config.js';

describe('validateReviewConfig', () => {
  it('parses a valid config into a normalized shape', () => {
    const result = validateReviewConfig({
      reviewerModels: 'gpt-5.5, claude-opus-4.8',
      confirmModel: 'claude-opus-4.8',
      reasoningEffort: 'xhigh',
    });
    expect(result).toEqual({
      reviewerModels: ['gpt-5.5', 'claude-opus-4.8'],
      confirmModel: 'claude-opus-4.8',
      reasoningEffort: 'xhigh',
    });
  });

  it('exposes the accepted reasoning-effort levels', () => {
    expect(REASONING_EFFORTS).toEqual([
      'none',
      'low',
      'medium',
      'high',
      'xhigh',
      'max',
    ]);
  });

  it('throws when REVIEWER_MODELS is empty', () => {
    expect(() =>
      validateReviewConfig({
        reviewerModels: '   ',
        confirmModel: 'claude-opus-4.8',
        reasoningEffort: 'xhigh',
      }),
    ).toThrow(/REVIEWER_MODELS/);
  });

  it('throws when REVIEWER_MODELS has duplicates', () => {
    expect(() =>
      validateReviewConfig({
        reviewerModels: 'gpt-5.5, gpt-5.5',
        confirmModel: 'claude-opus-4.8',
        reasoningEffort: 'xhigh',
      }),
    ).toThrow(/duplicate/i);
  });

  it('throws when CONFIRM_MODEL is blank', () => {
    expect(() =>
      validateReviewConfig({
        reviewerModels: 'gpt-5.5',
        confirmModel: '  ',
        reasoningEffort: 'xhigh',
      }),
    ).toThrow(/CONFIRM_MODEL/);
  });

  it('throws when REASONING_EFFORT is not an accepted level', () => {
    expect(() =>
      validateReviewConfig({
        reviewerModels: 'gpt-5.5',
        confirmModel: 'claude-opus-4.8',
        reasoningEffort: 'turbo',
      }),
    ).toThrow(/REASONING_EFFORT/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run --filter '@omnicraft/ai-review-core' test`
Expected: FAIL — `Cannot find module './config.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/ai-review-core/src/config.ts`:

```typescript
/** Reasoning-effort levels accepted by the Copilot CLI `--effort` flag. */
export const REASONING_EFFORTS = [
  'none',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
] as const;

/** A single accepted reasoning-effort level. */
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

/** Raw env-string config as read from the workflow. */
export interface RawReviewConfig {
  /** Comma-separated reviewer model IDs (`REVIEWER_MODELS`). */
  readonly reviewerModels: string;
  /** Single confirmation model ID (`CONFIRM_MODEL`). */
  readonly confirmModel: string;
  /** Reasoning effort level (`REASONING_EFFORT`). */
  readonly reasoningEffort: string;
}

/** Validated, normalized config. */
export interface ReviewConfig {
  /** Distinct, non-blank reviewer model IDs, in declared order. */
  readonly reviewerModels: string[];
  /** Confirmation model ID. */
  readonly confirmModel: string;
  /** Validated reasoning-effort level. */
  readonly reasoningEffort: ReasoningEffort;
}

function isReasoningEffort(value: string): value is ReasoningEffort {
  return (REASONING_EFFORTS as readonly string[]).includes(value);
}

/**
 * Validates raw model config. Throws a clear {@link Error} (naming the offending
 * variable) on any shape problem; returns the normalized {@link ReviewConfig}
 * on success. Performs format/shape checks only — whether a model is available
 * on the Copilot plan is not (and cannot be) checked here.
 */
export function validateReviewConfig(raw: RawReviewConfig): ReviewConfig {
  const reviewerModels = raw.reviewerModels
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);

  if (reviewerModels.length === 0) {
    throw new Error(
      'REVIEWER_MODELS must contain at least one non-blank model ID.',
    );
  }

  const unique = new Set(reviewerModels);
  if (unique.size !== reviewerModels.length) {
    throw new Error('REVIEWER_MODELS must not contain duplicate model IDs.');
  }

  const confirmModel = raw.confirmModel.trim();
  if (confirmModel.length === 0) {
    throw new Error('CONFIRM_MODEL must be a single non-blank model ID.');
  }

  const reasoningEffort = raw.reasoningEffort.trim();
  if (!isReasoningEffort(reasoningEffort)) {
    throw new Error(
      `REASONING_EFFORT must be one of: ${REASONING_EFFORTS.join('|')}.`,
    );
  }

  return {reviewerModels, confirmModel, reasoningEffort};
}
```

- [ ] **Step 4: Export from the package index**

Edit `packages/ai-review-core/src/index.ts`, adding after the range exports:

```typescript
export type {RawReviewConfig, ReasoningEffort, ReviewConfig} from './config.js';
export {REASONING_EFFORTS, validateReviewConfig} from './config.js';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun run --filter '@omnicraft/ai-review-core' test`
Expected: PASS — `config`, `range`, `marker` suites green.

- [ ] **Step 6: Commit**

```bash
git add packages/ai-review-core/src/config.ts packages/ai-review-core/src/config.test.ts packages/ai-review-core/src/index.ts
git commit -m "feat: add ai-review model-config validation"
```

---

### Task 5: Gate decision (`gate.ts` pure logic)

Pure function that converts the upstream job results plus the resolved range/verdict into the final gate outcome: an exit code and which label to apply. This is the heart of the required check. Side effects (reading the posted marker, applying labels, `process.exit`) live in the orchestrator (Task 10).

Decision order (from the spec):

1. Any upstream job (`config`/`prepare`/`review`/`confirm`) failed or cancelled → **fail** (incomplete review ≠ approval); leave labels untouched.
2. Else `hasChanges === false` → use the carried verdict; if absent → **fail safe**.
3. Else → use the freshly-read posted verdict; if absent → **fail safe**.

**Files:**

- Create: `packages/ai-review-core/src/gate.ts`
- Test: `packages/ai-review-core/src/gate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/ai-review-core/src/gate.test.ts`:

```typescript
import {describe, expect, it} from 'vitest';

import {decideGate} from './gate.js';

describe('decideGate', () => {
  it('approves and labels AI Approved when verdict is approved', () => {
    expect(
      decideGate({
        anyUpstreamFailed: false,
        hasChanges: true,
        carriedVerdict: null,
        postedVerdict: 'approved',
      }),
    ).toEqual({exitCode: 0, label: 'AI Approved'});
  });

  it('blocks and labels AI Need Change when verdict is need_change', () => {
    expect(
      decideGate({
        anyUpstreamFailed: false,
        hasChanges: true,
        carriedVerdict: null,
        postedVerdict: 'need_change',
      }),
    ).toEqual({exitCode: 1, label: 'AI Need Change'});
  });

  it('carries the prior verdict when there are no new commits', () => {
    expect(
      decideGate({
        anyUpstreamFailed: false,
        hasChanges: false,
        carriedVerdict: 'approved',
        postedVerdict: null,
      }),
    ).toEqual({exitCode: 0, label: 'AI Approved'});
  });

  it('fails (no label change) when an upstream job failed', () => {
    expect(
      decideGate({
        anyUpstreamFailed: true,
        hasChanges: true,
        carriedVerdict: null,
        postedVerdict: 'approved',
      }),
    ).toEqual({exitCode: 1, label: null});
  });

  it('fails safe when there are changes but no posted verdict', () => {
    expect(
      decideGate({
        anyUpstreamFailed: false,
        hasChanges: true,
        carriedVerdict: null,
        postedVerdict: null,
      }),
    ).toEqual({exitCode: 1, label: null});
  });

  it('fails safe when no new commits but the carried verdict is missing', () => {
    expect(
      decideGate({
        anyUpstreamFailed: false,
        hasChanges: false,
        carriedVerdict: null,
        postedVerdict: null,
      }),
    ).toEqual({exitCode: 1, label: null});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run --filter '@omnicraft/ai-review-core' test`
Expected: FAIL — `Cannot find module './gate.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/ai-review-core/src/gate.ts`:

```typescript
import type {Verdict} from './marker.js';

/** PR label applied by the gate. */
export type GateLabel = 'AI Approved' | 'AI Need Change';

/** Inputs to {@link decideGate}; all side effects resolved upstream. */
export interface GateInput {
  /** Whether any of config/prepare/review/confirm failed or was cancelled. */
  readonly anyUpstreamFailed: boolean;
  /** Whether this round had new commits to review. */
  readonly hasChanges: boolean;
  /** Verdict carried from the prior review; used only when `!hasChanges`. */
  readonly carriedVerdict: Verdict | null;
  /** Verdict parsed from the freshly posted review; used when `hasChanges`. */
  readonly postedVerdict: Verdict | null;
}

/** Gate outcome: the process exit code and which label to apply (if any). */
export interface GateDecision {
  /** `0` to pass the required check, `1` to block. */
  readonly exitCode: number;
  /** Label to apply, or `null` to leave existing labels untouched. */
  readonly label: GateLabel | null;
}

function fromVerdict(verdict: Verdict): GateDecision {
  if (verdict === 'approved') {
    return {exitCode: 0, label: 'AI Approved'};
  }
  return {exitCode: 1, label: 'AI Need Change'};
}

/**
 * Decides the gate outcome. Fails closed: an incomplete review or a
 * missing/unreadable verdict blocks rather than approves, and never relabels.
 */
export function decideGate(input: GateInput): GateDecision {
  if (input.anyUpstreamFailed) {
    return {exitCode: 1, label: null};
  }

  if (!input.hasChanges) {
    if (input.carriedVerdict === null) {
      return {exitCode: 1, label: null};
    }
    return fromVerdict(input.carriedVerdict);
  }

  if (input.postedVerdict === null) {
    return {exitCode: 1, label: null};
  }
  return fromVerdict(input.postedVerdict);
}
```

- [ ] **Step 4: Export from the package index**

Edit `packages/ai-review-core/src/index.ts`, adding after the config exports:

```typescript
export type {GateDecision, GateInput, GateLabel} from './gate.js';
export {decideGate} from './gate.js';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun run --filter '@omnicraft/ai-review-core' test`
Expected: PASS — all four suites (`marker`, `range`, `config`, `gate`) green.

- [ ] **Step 6: Verify typecheck and lint for the whole package**

Run: `bun run --filter '@omnicraft/ai-review-core' typecheck`
Expected: passes.

- [ ] **Step 7: Commit**

```bash
git add packages/ai-review-core/src/gate.ts packages/ai-review-core/src/gate.test.ts packages/ai-review-core/src/index.ts
git commit -m "feat: add ai-review gate decision logic"
```

---

### Task 6: Wire `ai-review-core` into `scripts` and add the GHA helper

The orchestrators live in `scripts/src/ai-review/` and consume the pure package. The `scripts` package already depends on a workspace package (`@omnicraft/free-ports`), so we follow that exactly. A tiny shared helper centralizes GitHub Actions output writing and typed env reads (no tests — side-effectful, mirroring `with-free-ports.ts`).

**Files:**

- Modify: `scripts/package.json` (add `@omnicraft/ai-review-core` workspace dep)
- Create: `scripts/src/ai-review/gha.ts`

- [ ] **Step 1: Add the workspace dependency**

Run: `bun add '@omnicraft/ai-review-core@workspace:^' --cwd scripts`

Expected: `scripts/package.json` gains `"@omnicraft/ai-review-core": "workspace:^"` under `dependencies`, and `bun.lock` updates. Do **not** hand-edit the version.

> If `--cwd` is not supported by the installed Bun, instead run from inside the package: `cd scripts && bun add '@omnicraft/ai-review-core@workspace:^'`.

- [ ] **Step 2: Verify the dependency landed**

Run: `grep -n 'ai-review-core' scripts/package.json`
Expected: one match under `dependencies`.

- [ ] **Step 3: Create the GitHub Actions helper**

Create `scripts/src/ai-review/gha.ts`:

```typescript
import {appendFileSync} from 'node:fs';

/**
 * Reads a required environment variable, throwing a clear error when it is
 * unset or blank. Orchestrators run only inside GitHub Actions, where these
 * are always provided by the workflow.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(`Required environment variable ${name} is unset or empty.`);
  }
  return value;
}

/** Reads an optional environment variable, returning `''` when unset. */
export function optionalEnv(name: string): string {
  return process.env[name] ?? '';
}

/**
 * Writes a single `name=value` step output to the `$GITHUB_OUTPUT` file.
 * Values must be single-line (SHAs, booleans, short JSON) — sufficient for
 * every output this gate produces.
 */
export function setOutput(name: string, value: string): void {
  const file = process.env.GITHUB_OUTPUT;
  if (file === undefined || file === '') {
    throw new Error(
      'GITHUB_OUTPUT is not set; not running under GitHub Actions.',
    );
  }
  if (value.includes('\n')) {
    throw new Error(`Output ${name} must be single-line.`);
  }
  appendFileSync(file, `${name}=${value}\n`);
}

/** Prints an error message and exits the process with code 1. */
export function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
```

- [ ] **Step 4: Verify typecheck**

Run: `bun run --filter '@omnicraft/scripts' typecheck`
Expected: passes with no errors (the helper compiles; `ai-review-core` resolves).

- [ ] **Step 5: Commit**

```bash
git add scripts/package.json scripts/src/ai-review/gha.ts bun.lock
git commit -m "chore: wire ai-review-core into scripts and add GHA helper"
```

---

### Task 7: `check-config.ts` orchestrator (config job)

Validates secrets and model env values before any model spend, and emits the reviewer-model matrix as a JSON array output. Thin: env in → `validateReviewConfig` → output or `fail`. No tests.

**Files:**

- Create: `scripts/src/ai-review/check-config.ts`

- [ ] **Step 1: Write the orchestrator**

Create `scripts/src/ai-review/check-config.ts`:

```typescript
import {validateReviewConfig} from '@omnicraft/ai-review-core';

import {fail, optionalEnv, setOutput} from './gha.js';

function main(): void {
  // The built-in GITHUB_TOKEN is always present; only the Copilot PAT secret
  // is a prerequisite that can be missing.
  const copilotToken = optionalEnv('COPILOT_CLI_TOKEN');
  if (copilotToken.trim() === '') {
    fail(
      'COPILOT_CLI_TOKEN secret is unset or empty. Create a fine-grained PAT ' +
        'with the "Copilot Requests" permission and store it as the ' +
        'COPILOT_CLI_TOKEN repository secret.',
    );
  }

  try {
    const config = validateReviewConfig({
      reviewerModels: optionalEnv('REVIEWER_MODELS'),
      confirmModel: optionalEnv('CONFIRM_MODEL'),
      reasoningEffort: optionalEnv('REASONING_EFFORT'),
    });
    setOutput('reviewer_models_json', JSON.stringify(config.reviewerModels));
    console.log(
      `Config OK. Reviewers: ${config.reviewerModels.join(', ')}; ` +
        `confirm: ${config.confirmModel}; effort: ${config.reasoningEffort}.`,
    );
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

main();
```

- [ ] **Step 2: Verify typecheck**

Run: `bun run --filter '@omnicraft/scripts' typecheck`
Expected: passes.

- [ ] **Step 3: Smoke-test the happy path locally**

Run:

```bash
GITHUB_OUTPUT=/tmp/ai-out.txt \
COPILOT_CLI_TOKEN=dummy \
REVIEWER_MODELS='gpt-5.5,claude-opus-4.8' \
CONFIRM_MODEL='claude-opus-4.8' \
REASONING_EFFORT='xhigh' \
bun scripts/src/ai-review/check-config.ts && cat /tmp/ai-out.txt
```

Expected: prints `Config OK. ...` and `/tmp/ai-out.txt` contains
`reviewer_models_json=["gpt-5.5","claude-opus-4.8"]`.

- [ ] **Step 4: Smoke-test a failure path locally**

Run:

```bash
GITHUB_OUTPUT=/tmp/ai-out.txt \
COPILOT_CLI_TOKEN=dummy \
REVIEWER_MODELS='gpt-5.5,gpt-5.5' \
CONFIRM_MODEL='claude-opus-4.8' \
REASONING_EFFORT='xhigh' \
bun scripts/src/ai-review/check-config.ts; echo "exit=$?"
```

Expected: prints the duplicate-models error and `exit=1`.

- [ ] **Step 5: Commit**

```bash
git add scripts/src/ai-review/check-config.ts
git commit -m "feat: add check-config orchestrator for ai-review"
```

---

### Task 8: `resolve-range.ts` orchestrator (prepare job)

Resolves PR context from the `workflow_run` event, fetches PR refs into the trusted checkout, reads prior reviews, and computes the range via the pure functions. Side-effectful; no tests (the logic it wires is already tested in Tasks 2–3).

**Files:**

- Create: `scripts/src/ai-review/git.ts` (small `git`/`gh` exec helpers)
- Create: `scripts/src/ai-review/resolve-range.ts`

- [ ] **Step 1: Create the exec helpers**

Create `scripts/src/ai-review/git.ts`:

```typescript
import {execFileSync} from 'node:child_process';

/** Runs a command, returning trimmed stdout. Throws on a non-zero exit. */
export function run(command: string, args: readonly string[]): string {
  return execFileSync(command, args, {encoding: 'utf8'}).trim();
}

/**
 * Runs `git merge-base --is-ancestor <ancestor> <descendant>` and returns
 * whether the first commit is an ancestor of the second. Git exits 0 for true,
 * 1 for false, and >1 on error — only 1 is treated as `false`.
 */
export function isAncestor(ancestor: string, descendant: string): boolean {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], {
      stdio: 'ignore',
    });
    return true;
  } catch (error) {
    const code = (error as {status?: number}).status;
    if (code === 1) {
      return false;
    }
    throw error;
  }
}
```

- [ ] **Step 2: Write the orchestrator**

Create `scripts/src/ai-review/resolve-range.ts`:

```typescript
import {parseLatestMarker, resolveReviewRange} from '@omnicraft/ai-review-core';

import {fail, requireEnv, setOutput} from './gha.js';
import {isAncestor, run} from './git.js';

interface PullContext {
  readonly prNumber: number;
  readonly headSha: string;
  readonly baseSha: string;
  readonly baseRef: string;
}

interface GhReview {
  readonly body?: string;
  readonly submitted_at?: string;
}

/** Resolves PR number + head SHA from the workflow_run event payload. */
function resolvePull(repo: string, headSha: string): {prNumber: number} {
  const pullsJson = requireEnv('WORKFLOW_RUN_PULLS');
  const pulls = JSON.parse(pullsJson) as Array<{number?: number}>;
  const first = pulls[0];
  if (first?.number !== undefined) {
    return {prNumber: first.number};
  }
  // workflow_run sometimes carries no PRs; fall back to the commit's PRs.
  const fallback = run('gh', [
    'api',
    `repos/${repo}/commits/${headSha}/pulls`,
    '--jq',
    '.[0].number',
  ]);
  if (fallback === '' || fallback === 'null') {
    fail(`Could not resolve a PR for head ${headSha}.`);
  }
  return {prNumber: Number(fallback)};
}

function resolveContext(): PullContext {
  const repo = requireEnv('GH_REPO');
  const headSha = requireEnv('WORKFLOW_RUN_HEAD_SHA');
  const {prNumber} = resolvePull(repo, headSha);

  // Read base ref/sha straight from the PR.
  const baseRef = run('gh', [
    'api',
    `repos/${repo}/pulls/${prNumber}`,
    '--jq',
    '.base.ref',
  ]);
  const baseSha = run('gh', [
    'api',
    `repos/${repo}/pulls/${prNumber}`,
    '--jq',
    '.base.sha',
  ]);
  return {prNumber, headSha, baseSha, baseRef};
}

function readReviewBodies(repo: string, prNumber: number): string[] {
  const json = run('gh', [
    'api',
    `repos/${repo}/pulls/${prNumber}/reviews`,
    '--paginate',
  ]);
  const reviews = JSON.parse(json) as GhReview[];
  return reviews.map((review) => review.body ?? '');
}

function main(): void {
  const repo = requireEnv('GH_REPO');
  const context = resolveContext();

  // Fetch the PR head and base into the trusted checkout for git ancestry ops.
  run('git', ['fetch', 'origin', context.baseRef]);
  run('git', ['fetch', 'origin', `pull/${context.prNumber}/head`]);

  const previousMarker = parseLatestMarker(
    readReviewBodies(repo, context.prNumber),
  );

  const startIsAncestorOfHead =
    previousMarker !== null &&
    isAncestor(previousMarker.reviewedHead, context.headSha);

  const range = resolveReviewRange({
    headSha: context.headSha,
    baseSha: context.baseSha,
    previousMarker,
    startIsAncestorOfHead,
  });

  setOutput('pr_number', String(context.prNumber));
  setOutput('head_sha', context.headSha);
  setOutput('base_sha', context.baseSha);
  setOutput('base_ref', context.baseRef);
  setOutput('start_sha', range.startSha ?? '');
  setOutput('is_full', String(range.isFull));
  setOutput('has_changes', String(range.hasChanges));
  setOutput('carried_verdict', range.carriedVerdict ?? '');

  console.log(
    `PR #${context.prNumber}: head=${context.headSha} ` +
      `start=${range.startSha ?? '(full)'} isFull=${range.isFull} ` +
      `hasChanges=${range.hasChanges} carried=${range.carriedVerdict ?? '-'}`,
  );
}

main();
```

- [ ] **Step 3: Verify typecheck**

Run: `bun run --filter '@omnicraft/scripts' typecheck`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add scripts/src/ai-review/git.ts scripts/src/ai-review/resolve-range.ts
git commit -m "feat: add resolve-range orchestrator for ai-review"
```

> Note: this orchestrator is exercised end-to-end in the manual integration checklist (Task 15), not by unit tests — it only wires already-tested pure functions to `git`/`gh`.

---

### Task 9: `read-verdict.ts` orchestrator (used by gate)

Reads the most recent posted review for the PR and extracts the verdict marker the confirm job just wrote. Emits `verdict` (`approved` / `need_change` / empty). Side-effectful; no tests.

**Files:**

- Create: `scripts/src/ai-review/read-verdict.ts`

- [ ] **Step 1: Write the orchestrator**

Create `scripts/src/ai-review/read-verdict.ts`:

```typescript
import {parseLatestMarker} from '@omnicraft/ai-review-core';

import {requireEnv, setOutput} from './gha.js';
import {run} from './git.js';

interface GhReview {
  readonly body?: string;
}

function main(): void {
  const repo = requireEnv('GH_REPO');
  const prNumber = requireEnv('PR_NUMBER');

  const json = run('gh', [
    'api',
    `repos/${repo}/pulls/${prNumber}/reviews`,
    '--paginate',
  ]);
  const reviews = JSON.parse(json) as GhReview[];
  const marker = parseLatestMarker(reviews.map((review) => review.body ?? ''));

  // Empty output is read by gate.ts as "unreadable" → fail safe.
  setOutput('verdict', marker?.verdict ?? '');
  console.log(`Read verdict: ${marker?.verdict ?? '(none)'}`);
}

main();
```

- [ ] **Step 2: Verify typecheck**

Run: `bun run --filter '@omnicraft/scripts' typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add scripts/src/ai-review/read-verdict.ts
git commit -m "feat: add read-verdict orchestrator for ai-review"
```

---

### Task 10: `gate.ts` orchestrator (gate job — the required check)

Reads the upstream job results and prepare outputs, calls `decideGate`, applies the label (creating both labels if missing, removing the opposite one), and exits with the decided code. Side-effectful; no tests (logic tested in Task 5).

**Files:**

- Create: `scripts/src/ai-review/labels.ts`
- Create: `scripts/src/ai-review/gate.ts`

- [ ] **Step 1: Create the label helper**

Create `scripts/src/ai-review/labels.ts`:

```typescript
import type {GateLabel} from '@omnicraft/ai-review-core';

import {run} from './git.js';

const LABELS: readonly GateLabel[] = ['AI Approved', 'AI Need Change'];

/** Ensures both gate labels exist in the repo, creating any that are missing. */
function ensureLabelsExist(repo: string): void {
  for (const label of LABELS) {
    try {
      run('gh', ['api', `repos/${repo}/labels/${encodeURIComponent(label)}`]);
    } catch {
      run('gh', [
        'api',
        '--method',
        'POST',
        `repos/${repo}/labels`,
        '-f',
        `name=${label}`,
      ]);
    }
  }
}

/**
 * Applies `label` to the PR and removes the opposite gate label, creating the
 * labels first if needed. A no-op when `label` is `null`.
 */
export function applyLabel(
  repo: string,
  prNumber: string,
  label: GateLabel | null,
): void {
  if (label === null) {
    return;
  }
  ensureLabelsExist(repo);

  const opposite = LABELS.find((candidate) => candidate !== label);
  if (opposite !== undefined) {
    try {
      run('gh', [
        'api',
        '--method',
        'DELETE',
        `repos/${repo}/issues/${prNumber}/labels/${encodeURIComponent(opposite)}`,
      ]);
    } catch {
      // The opposite label was not present; nothing to remove.
    }
  }

  run('gh', [
    'api',
    '--method',
    'POST',
    `repos/${repo}/issues/${prNumber}/labels`,
    '-f',
    `labels[]=${label}`,
  ]);
}
```

- [ ] **Step 2: Write the orchestrator**

Create `scripts/src/ai-review/gate.ts`:

```typescript
import {decideGate} from '@omnicraft/ai-review-core';
import type {Verdict} from '@omnicraft/ai-review-core';

import {optionalEnv, requireEnv} from './gha.js';
import {applyLabel} from './labels.js';

/** A GitHub Actions job result string. */
type JobResult = 'success' | 'failure' | 'cancelled' | 'skipped' | '';

function isFailedOrCancelled(result: JobResult): boolean {
  return result === 'failure' || result === 'cancelled';
}

function asVerdict(value: string): Verdict | null {
  if (value === 'approved' || value === 'need_change') {
    return value;
  }
  return null;
}

function main(): void {
  const repo = requireEnv('GH_REPO');
  const prNumber = requireEnv('PR_NUMBER');

  const upstream: JobResult[] = [
    optionalEnv('CONFIG_RESULT') as JobResult,
    optionalEnv('PREPARE_RESULT') as JobResult,
    optionalEnv('REVIEW_RESULT') as JobResult,
    optionalEnv('CONFIRM_RESULT') as JobResult,
  ];
  const anyUpstreamFailed = upstream.some(isFailedOrCancelled);

  const decision = decideGate({
    anyUpstreamFailed,
    hasChanges: optionalEnv('HAS_CHANGES') === 'true',
    carriedVerdict: asVerdict(optionalEnv('CARRIED_VERDICT')),
    postedVerdict: asVerdict(optionalEnv('POSTED_VERDICT')),
  });

  applyLabel(repo, prNumber, decision.label);

  console.log(
    `Gate decision: exit=${decision.exitCode} ` +
      `label=${decision.label ?? '(unchanged)'}`,
  );
  process.exit(decision.exitCode);
}

main();
```

- [ ] **Step 3: Verify typecheck**

Run: `bun run --filter '@omnicraft/scripts' typecheck`
Expected: passes.

- [ ] **Step 4: Lint and format the whole scripts package**

Run: `bun run format:check` (from repo root)
Expected: passes, or run `bun run format` to fix, then re-check.

- [ ] **Step 5: Commit**

```bash
git add scripts/src/ai-review/labels.ts scripts/src/ai-review/gate.ts
git commit -m "feat: add gate orchestrator for ai-review"
```

---

### Task 11: Versioned prompt files

Three trusted prompt files injected into the CLI at runtime (never embedded in YAML). They live in the default-branch checkout so a PR cannot tamper with them. The confirm prompt pins the exact summary template so formatting stays consistent without a structured contract.

**Files:**

- Create: `scripts/src/ai-review/prompts/review-general.md`
- Create: `scripts/src/ai-review/prompts/review-security.md`
- Create: `scripts/src/ai-review/prompts/confirm.md`

- [ ] **Step 1: Create the general reviewer prompt**

Create `scripts/src/ai-review/prompts/review-general.md`:

```markdown
# Role: Code Reviewer (general pass)

You are one of several expert reviewers on a pull request. Review **only the
commit range** you are given (the new commits since the last review), not the
whole PR. Focus on correctness and design:

- **Bugs:** logic errors, off-by-one, null/undefined handling, race conditions,
  incorrect error handling, broken edge cases.
- **Code quality:** clarity, dead code, duplication, misleading names, violations
  of the project conventions in `CLAUDE.md` and `AGENTS.md` (read them).
- **Structural design:** module boundaries, leaky abstractions, coupling.

## Context you may read

- `gh pr view` and `gh pr diff` for the PR description and full diff.
- Existing PR review comments (do not repeat points already raised).
- The code in the working directory (you are running with `-C pr-head`).

## Empirical validation

When you suspect a real bug, you may write and run a **throwaway test** (e.g.
`bun run typecheck`, `bun run test`, or a scratch script) to confirm it. Include
the exact command and its output in your report as proof. Scratch files you
create are discarded with the runner.

## Hard rules

- **Do NOT post anything to the PR.** No comments, no reviews. You only produce a
  report.
- Report only issues you are reasonably confident about. Prefer precision over
  volume; a downstream confirmation agent will re-verify and may discard your
  findings.

## Output

Write a Markdown report to stdout with one section per finding:

- **Title** — a one-line summary.
- **Location** — `path:line` (the exact changed line where possible).
- **Severity** — your estimate: Critical / High / Medium / Low / nit.
- **Explanation** — why it is a problem.
- **Evidence** — repro command + output, if you validated it.
```

- [ ] **Step 2: Create the security reviewer prompt**

Create `scripts/src/ai-review/prompts/review-security.md`:

```markdown
# Role: Security Reviewer (focused pass)

You are a security specialist reviewing **only the given commit range** of a pull
request. Hunt for security-relevant defects:

- Injection (command, SQL, template), unsafe deserialization.
- Authentication / authorization gaps, privilege escalation.
- Secrets in code or logs, weak or misused crypto.
- SSRF, path traversal, unsafe file handling.
- Dependency risk (new packages, suspicious versions).
- Unsafe handling of untrusted input.

## Context you may read

- `gh pr view` / `gh pr diff`, existing review comments.
- The code in the working directory (running with `-C pr-head`).
- Project conventions in `CLAUDE.md` / `AGENTS.md`.

## Empirical validation

You may write and run a **throwaway** proof-of-concept or test to confirm a
suspected vulnerability, and include the command + output as evidence.

## Hard rules

- **Do NOT post anything to the PR.** Produce a report only.
- Report only credible issues; the confirmation agent re-verifies and discards
  anything it cannot confirm.

## Output

Same format as the general pass: one section per finding with Title, Location
(`path:line`), Severity (Critical / High / Medium / Low / nit), Explanation, and
Evidence.
```

- [ ] **Step 3: Create the confirmation prompt**

Create `scripts/src/ai-review/prompts/confirm.md`:

````markdown
# Role: Senior Reviewer (confirmation & posting)

You receive the reports from several model reviewers (general + security passes).
Reconcile them into a single, precise PR review. You are running with `-C pr-head`
(the code under review) and have `gh` available.

## Process

1. **De-duplicate** findings that the reviewers raised in common.
2. **Re-verify each finding against the real code/diff.** When a reviewer
   included a repro test, **re-run it** to confirm or refute. **Discard anything
   you cannot independently confirm** — false positives must not survive.
3. **Assign a severity** to each surviving finding: Critical / High / Medium /
   Low / nit.
4. **Post exactly one PR review** via
   `gh api repos/{owner}/{repo}/pulls/{number}/reviews` with `event=COMMENT`:
   - **Inline comments** anchored to the exact changed lines for each finding.
     If a line is not part of the diff, move that finding into the summary body
     instead (do not fail). Retry once on an anchoring error.
   - A **summary body** in the exact template below.

## Severity gate

Findings of **Medium, High, or Critical** mean the change is **not** approved.
**Low / nit** findings are non-blocking notes. Set the verdict accordingly:
`need_change` if any Medium+ finding survives, otherwise `approved`.

## Summary body template (use verbatim, filling the placeholders)

​```

## AI Review

**Reviewed range:** `<RANGE>`

| Severity | Count |
| -------- | ----- |
| Critical | <n>   |
| High     | <n>   |
| Medium   | <n>   |
| Low      | <n>   |
| nit      | <n>   |

<one short paragraph of overall assessment>

<!-- ai-review reviewed-head=<HEAD_SHA> verdict=approved|need_change -->

​```

The trailing HTML comment marker is **required** and must be the last line. Use
the real head SHA you were given and the verdict you decided. Do not emit any
other machine-readable structure.
````

- [ ] **Step 4: Verify the prompts are valid Markdown and present**

Run: `ls scripts/src/ai-review/prompts/ && bun run format:check`
Expected: three files listed; format check passes (run `bun run format` if not).

- [ ] **Step 5: Commit**

```bash
git add scripts/src/ai-review/prompts/
git commit -m "feat: add ai-review reviewer and confirmation prompts"
```

---

### Task 12: The `ai-review.yml` workflow

The five-job workflow, triggered by `CI` completing. Every gate-critical step runs from the trusted default-branch checkout; the PR's code is checked out separately into `pr-head/`. Copy the file verbatim, then verify it parses.

**Files:**

- Create: `.github/workflows/ai-review.yml`

- [ ] **Step 1: Create the workflow file**

Create `.github/workflows/ai-review.yml`:

```yaml
name: AI Review

on:
  workflow_run:
    workflows: ['CI']
    types: [completed]

concurrency:
  group: ai-review-${{ github.event.workflow_run.head_branch }}
  cancel-in-progress: true

env:
  REVIEWER_MODELS: ${{ vars.AI_REVIEW_REVIEWER_MODELS || 'gpt-5.5,claude-opus-4.8' }}
  CONFIRM_MODEL: ${{ vars.AI_REVIEW_CONFIRM_MODEL || 'claude-opus-4.8' }}
  REASONING_EFFORT: ${{ vars.AI_REVIEW_EFFORT || 'xhigh' }}

jobs:
  config:
    name: Validate config
    runs-on: ubuntu-latest
    if: >-
      github.event.workflow_run.event == 'pull_request' &&
      github.event.workflow_run.conclusion == 'success'
    permissions: {}
    outputs:
      reviewer_models_json: ${{ steps.check.outputs.reviewer_models_json }}
    steps:
      - uses: actions/checkout@v6
      - uses: ./.github/actions/setup
      - name: Check config
        id: check
        run: bun scripts/src/ai-review/check-config.ts
        env:
          COPILOT_CLI_TOKEN: ${{ secrets.COPILOT_CLI_TOKEN }}

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
      base_sha: ${{ steps.range.outputs.base_sha }}
      base_ref: ${{ steps.range.outputs.base_ref }}
      start_sha: ${{ steps.range.outputs.start_sha }}
      is_full: ${{ steps.range.outputs.is_full }}
      has_changes: ${{ steps.range.outputs.has_changes }}
      carried_verdict: ${{ steps.range.outputs.carried_verdict }}
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0
      - uses: ./.github/actions/setup
      - name: Resolve range
        id: range
        run: bun scripts/src/ai-review/resolve-range.ts
        env:
          GH_TOKEN: ${{ github.token }}
          GH_REPO: ${{ github.repository }}
          WORKFLOW_RUN_HEAD_SHA: ${{ github.event.workflow_run.head_sha }}
          WORKFLOW_RUN_PULLS: ${{ toJSON(github.event.workflow_run.pull_requests) }}

  review:
    name: Review (${{ matrix.model }})
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
    steps:
      - uses: actions/checkout@v6
      - uses: ./.github/actions/setup
      - name: Checkout PR head
        uses: actions/checkout@v6
        with:
          ref: ${{ needs.prepare.outputs.head_sha }}
          path: pr-head
          fetch-depth: 0
      - name: Install deps in pr-head
        run: bun install --frozen-lockfile
        working-directory: pr-head
      - name: Install Copilot CLI
        run: npm install -g @github/copilot
      - name: General review pass
        run: |
          copilot --model "$MODEL" --effort "$REASONING_EFFORT" \
            --context long_context \
            --allow-tool 'shell(git:*),shell(gh:*),shell(bun:*),read,write' \
            --secret-env-vars COPILOT_GITHUB_TOKEN \
            -C pr-head \
            --prompt-file "$GITHUB_WORKSPACE/scripts/src/ai-review/prompts/review-general.md" \
            > "report-$MODEL-general.md"
        env:
          MODEL: ${{ matrix.model }}
          COPILOT_GITHUB_TOKEN: ${{ secrets.COPILOT_CLI_TOKEN }}
          GH_TOKEN: ${{ github.token }}
          REVIEW_RANGE: ${{ needs.prepare.outputs.start_sha && format('{0}..{1}', needs.prepare.outputs.start_sha, needs.prepare.outputs.head_sha) || format('{0}...{1}', needs.prepare.outputs.base_sha, needs.prepare.outputs.head_sha) }}
      - name: Security review pass
        run: |
          copilot --model "$MODEL" --effort "$REASONING_EFFORT" \
            --context long_context \
            --allow-tool 'shell(git:*),shell(gh:*),shell(bun:*),read,write' \
            --secret-env-vars COPILOT_GITHUB_TOKEN \
            -C pr-head \
            --prompt-file "$GITHUB_WORKSPACE/scripts/src/ai-review/prompts/review-security.md" \
            > "report-$MODEL-security.md"
        env:
          MODEL: ${{ matrix.model }}
          COPILOT_GITHUB_TOKEN: ${{ secrets.COPILOT_CLI_TOKEN }}
          GH_TOKEN: ${{ github.token }}
          REVIEW_RANGE: ${{ needs.prepare.outputs.start_sha && format('{0}..{1}', needs.prepare.outputs.start_sha, needs.prepare.outputs.head_sha) || format('{0}...{1}', needs.prepare.outputs.base_sha, needs.prepare.outputs.head_sha) }}
      - name: Upload reports
        uses: actions/upload-artifact@v4
        with:
          name: reports-${{ matrix.model }}
          path: |
            report-${{ matrix.model }}-general.md
            report-${{ matrix.model }}-security.md

  confirm:
    name: Confirm & post review
    needs: [config, prepare, review]
    if: needs.prepare.outputs.has_changes == 'true' && needs.review.result == 'success'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v6
      - uses: ./.github/actions/setup
      - name: Checkout PR head
        uses: actions/checkout@v6
        with:
          ref: ${{ needs.prepare.outputs.head_sha }}
          path: pr-head
          fetch-depth: 0
      - name: Install deps in pr-head
        run: bun install --frozen-lockfile
        working-directory: pr-head
      - name: Install Copilot CLI
        run: npm install -g @github/copilot
      - name: Download reports
        uses: actions/download-artifact@v4
        with:
          path: reports
          merge-multiple: true
      - name: Confirm and post
        run: |
          copilot --model "$CONFIRM_MODEL" --effort "$REASONING_EFFORT" \
            --context long_context \
            --allow-tool 'shell(git:*),shell(gh:*),shell(bun:*),read,write' \
            --secret-env-vars COPILOT_GITHUB_TOKEN \
            -C pr-head \
            --prompt-file "$GITHUB_WORKSPACE/scripts/src/ai-review/prompts/confirm.md"
        env:
          COPILOT_GITHUB_TOKEN: ${{ secrets.COPILOT_CLI_TOKEN }}
          GH_TOKEN: ${{ github.token }}
          GH_REPO: ${{ github.repository }}
          PR_NUMBER: ${{ needs.prepare.outputs.pr_number }}
          HEAD_SHA: ${{ needs.prepare.outputs.head_sha }}
          REVIEW_RANGE: ${{ needs.prepare.outputs.start_sha && format('{0}..{1}', needs.prepare.outputs.start_sha, needs.prepare.outputs.head_sha) || format('{0}...{1}', needs.prepare.outputs.base_sha, needs.prepare.outputs.head_sha) }}

  gate:
    name: AI Review Gate
    needs: [config, prepare, review, confirm]
    if: >-
      always() &&
      github.event.workflow_run.event == 'pull_request' &&
      github.event.workflow_run.conclusion == 'success'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
      issues: write
    steps:
      - uses: actions/checkout@v6
      - uses: ./.github/actions/setup
      - name: Read posted verdict
        id: verdict
        if: needs.prepare.outputs.has_changes == 'true' && needs.confirm.result == 'success'
        run: bun scripts/src/ai-review/read-verdict.ts
        env:
          GH_TOKEN: ${{ github.token }}
          GH_REPO: ${{ github.repository }}
          PR_NUMBER: ${{ needs.prepare.outputs.pr_number }}
      - name: Decide gate
        run: bun scripts/src/ai-review/gate.ts
        env:
          GH_TOKEN: ${{ github.token }}
          GH_REPO: ${{ github.repository }}
          PR_NUMBER: ${{ needs.prepare.outputs.pr_number }}
          CONFIG_RESULT: ${{ needs.config.result }}
          PREPARE_RESULT: ${{ needs.prepare.result }}
          REVIEW_RESULT: ${{ needs.review.result }}
          CONFIRM_RESULT: ${{ needs.confirm.result }}
          HAS_CHANGES: ${{ needs.prepare.outputs.has_changes }}
          CARRIED_VERDICT: ${{ needs.prepare.outputs.carried_verdict }}
          POSTED_VERDICT: ${{ steps.verdict.outputs.verdict }}
```

- [ ] **Step 2: Validate the workflow YAML parses**

Run:

```bash
bun -e "import('node:fs').then(fs => import('yaml').then(y => { y.parse(fs.readFileSync('.github/workflows/ai-review.yml','utf8')); console.log('YAML OK'); }))"
```

Expected: prints `YAML OK` (the `yaml` package is already a dependency of `@omnicraft/markdown-frontmatter`, so it resolves from the workspace). If it does not resolve, instead validate with `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ai-review.yml')); print('YAML OK')"`.

- [ ] **Step 3: Format check**

Run: `bun run format:check`
Expected: passes (run `bun run format` first if Prettier reformats the YAML).

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ai-review.yml
git commit -m "feat: add ai-review workflow"
```

---

### Task 13: Verify the real Copilot CLI invocation syntax

**The CLI flags in Task 12 (`--prompt-file`, `--allow-tool`, `--context`, `--effort`, `--secret-env-vars`, `-C`, `--model`) are provisional** and must be reconciled with the installed `@github/copilot` version before the workflow can run. This task confirms or corrects them. Per the spec, also confirm that `--model` governs the built-in `/review` pass; if it does not, replace the general pass with a plain model-pinned review prompt of the same intent (a `prompts/review-general.md` is already used as the prompt, so this fallback is just dropping reliance on the built-in `/review` keyword).

**Files:**

- Modify (if needed): `.github/workflows/ai-review.yml`
- Modify (if needed): `scripts/src/ai-review/prompts/review-general.md`

- [ ] **Step 1: Inspect the CLI's actual flags**

Run:

```bash
npm install -g @github/copilot && copilot --help
```

Expected: the help text. Note the real spellings for: model selection, reasoning effort, working directory, allowed tools, secret env vars, context window, and how a prompt is passed (file vs stdin vs `--prompt`).

- [ ] **Step 2: Reconcile the workflow**

For each flag in `.github/workflows/ai-review.yml` whose real spelling differs from Task 12, edit the three `copilot ...` invocations (general, security, confirm) to match. Keep the **intent** identical: pinned model, `xhigh` effort, long context, the four allowed tool families, the stripped secret env var, `-C pr-head`, and the trusted prompt file.

- [ ] **Step 3: Confirm `--model` governs `/review`**

If the CLI exposes a built-in `/review` and it honors `--model`, you may keep using it. If not, ensure the general pass relies solely on `prompts/review-general.md` (model-pinned), preserving the "two reviewers, different models" guarantee. Adjust the prompt wording only if needed.

- [ ] **Step 4: Re-validate the YAML**

Run: `bun run format:check` and the YAML-parse check from Task 12 Step 2.
Expected: both pass.

- [ ] **Step 5: Commit (only if changes were made)**

```bash
git add .github/workflows/ai-review.yml scripts/src/ai-review/prompts/review-general.md
git commit -m "fix: reconcile ai-review workflow with real Copilot CLI flags"
```

---

### Task 14: Full-suite verification

Confirm the new package and scripts pass every check the repo's CI runs, before relying on them.

**Files:** none (verification only).

- [ ] **Step 1: Run the core package tests**

Run: `bun run --filter '@omnicraft/ai-review-core' test`
Expected: PASS — `marker`, `range`, `config`, `gate` suites all green.

- [ ] **Step 2: Typecheck both packages**

Run:

```bash
bun run --filter '@omnicraft/ai-review-core' typecheck && \
bun run --filter '@omnicraft/scripts' typecheck
```

Expected: both pass with no errors.

- [ ] **Step 3: Lint and format the repo**

Run: `bun run format:check`
Expected: passes (run `bun run format` to fix, then re-check, if needed).

- [ ] **Step 4: Confirm no stray `any` or Bun-specific APIs**

Run:

```bash
grep -rn ': any\b\|Bun\.' packages/ai-review-core/src scripts/src/ai-review || echo "clean"
```

Expected: prints `clean` (no `any` types, no `Bun.*` calls — Node APIs only).

- [ ] **Step 5: Commit (only if format made changes)**

```bash
git add -A
git commit -m "chore: format ai-review files"
```

---

### Task 15: Manual integration checklist and prerequisites doc

Document the one-time maintainer setup and the manual end-to-end validation (no automated test covers the live workflow). This is a documentation deliverable plus a checklist to run on a throwaway PR.

**Files:**

- Create: `scripts/src/ai-review/README.md`

- [ ] **Step 1: Write the README**

Create `scripts/src/ai-review/README.md`:

```markdown
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
```

- [ ] **Step 2: Format check**

Run: `bun run format:check`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add scripts/src/ai-review/README.md
git commit -m "docs: add ai-review prerequisites and integration checklist"
```

---

## Plan complete

All spec requirements are covered: pure tested logic in `@omnicraft/ai-review-core`
(marker, range, config, gate), thin `git`/`gh` orchestrators in
`scripts/src/ai-review/`, versioned prompts, the five-job trusted-checkout
workflow gated on CI success, and the maintainer prerequisites + manual
integration checklist. Execute task-by-task with the required sub-skill; do not
mark a task complete until its verification step passes.
