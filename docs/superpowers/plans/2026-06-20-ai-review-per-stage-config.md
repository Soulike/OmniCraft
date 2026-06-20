# AI Review Per-Stage Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AI-review model + reasoning-effort independently configurable per stage (general review, security review, confirm), with defaults identical to today's behavior.

**Architecture:** Expand `ReviewConfig` from one shared model list + one effort into three nested per-stage configs validated by reusable helpers. Split the single `review` workflow job into `general-review` / `security-review`, each driven by its own model list and routed through one new composite action (`run-review-pass`) that owns the whole review pipeline. `confirm` stays a separate job with its own effort.

**Tech Stack:** TypeScript, Vitest (`bun run test`), GitHub Actions (composite actions + matrix), Bun runtime.

Spec: `docs/superpowers/specs/2026-06-20-ai-review-per-stage-config-design.md`

---

## File Structure

| File                                         | Responsibility                                                                                  | Action |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------ |
| `packages/ai-review-core/src/config.ts`      | Nested `ReviewConfig` shape + `parseModelList` / `parseEffort` helpers + `validateReviewConfig` | Modify |
| `packages/ai-review-core/src/config.test.ts` | Unit tests for the new shape + relaxed `>=1` rule                                               | Modify |
| `scripts/src/ai-review/check-config.ts`      | Read 6 env vars, emit two model-list JSON outputs                                               | Modify |
| `.github/actions/run-review-pass/action.yml` | Composite action: prepare PR head + run one Copilot review pass + verify report                 | Create |
| `.github/workflows/ai-review.yml`            | 6 per-stage env vars; split review job; confirm uses `CONFIRM_EFFORT`; gate rewiring            | Modify |
| `scripts/src/ai-review/README.md`            | Maintainer Variables list updated to 6 vars                                                     | Modify |

`index.ts` re-exports `RawReviewConfig` / `ReviewConfig` / `validateReviewConfig` by name — no change needed since the names are stable; the shapes change behind them.

---

## Task 1: Nested config shape + validation helpers

**Files:**

- Modify: `packages/ai-review-core/src/config.ts`
- Test: `packages/ai-review-core/src/config.test.ts`

- [ ] **Step 1: Rewrite the test file for the nested shape**

Replace the entire contents of `packages/ai-review-core/src/config.test.ts` with:

```ts
import {describe, expect, it} from 'vitest';

import {REASONING_EFFORTS, validateReviewConfig} from './config.js';

function validRaw() {
  return {
    generalModels: 'gpt-5.5, claude-opus-4.8',
    securityModels: 'gpt-5.5, claude-opus-4.8',
    confirmModel: 'claude-opus-4.8',
    generalEffort: 'xhigh',
    securityEffort: 'high',
    confirmEffort: 'max',
  };
}

describe('validateReviewConfig', () => {
  it('parses a valid config into the nested shape', () => {
    expect(validateReviewConfig(validRaw())).toEqual({
      general: {models: ['gpt-5.5', 'claude-opus-4.8'], effort: 'xhigh'},
      security: {models: ['gpt-5.5', 'claude-opus-4.8'], effort: 'high'},
      confirm: {model: 'claude-opus-4.8', effort: 'max'},
    });
  });

  it('accepts a single-model list per stage', () => {
    const result = validateReviewConfig({
      ...validRaw(),
      generalModels: 'gpt-5.5',
    });
    expect(result.general.models).toEqual(['gpt-5.5']);
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

  it('throws when GENERAL_MODELS is empty', () => {
    expect(() =>
      validateReviewConfig({...validRaw(), generalModels: '   '}),
    ).toThrow(/GENERAL_MODELS/);
  });

  it('throws when SECURITY_MODELS is empty', () => {
    expect(() =>
      validateReviewConfig({...validRaw(), securityModels: '   '}),
    ).toThrow(/SECURITY_MODELS/);
  });

  it('throws when GENERAL_MODELS has duplicates', () => {
    expect(() =>
      validateReviewConfig({...validRaw(), generalModels: 'gpt-5.5, gpt-5.5'}),
    ).toThrow(/duplicate/i);
  });

  it('throws when CONFIRM_MODEL is blank', () => {
    expect(() =>
      validateReviewConfig({...validRaw(), confirmModel: '  '}),
    ).toThrow(/CONFIRM_MODEL/);
  });

  it('throws when GENERAL_EFFORT is not an accepted level', () => {
    expect(() =>
      validateReviewConfig({...validRaw(), generalEffort: 'turbo'}),
    ).toThrow(/GENERAL_EFFORT/);
  });

  it('throws when CONFIRM_EFFORT is not an accepted level', () => {
    expect(() =>
      validateReviewConfig({...validRaw(), confirmEffort: 'turbo'}),
    ).toThrow(/CONFIRM_EFFORT/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test --filter @omnicraft/ai-review-core`
Expected: FAIL — `validateReviewConfig` still expects the old `reviewerModels`/`reasoningEffort` shape, so the nested-shape assertions and the new `GENERAL_*` error matchers fail.

- [ ] **Step 3: Rewrite `config.ts` with helpers and the nested shape**

Replace the entire contents of `packages/ai-review-core/src/config.ts` with:

```ts
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
  /** Comma-separated general-review model IDs (`GENERAL_MODELS`). */
  readonly generalModels: string;
  /** Comma-separated security-review model IDs (`SECURITY_MODELS`). */
  readonly securityModels: string;
  /** Single confirmation model ID (`CONFIRM_MODEL`). */
  readonly confirmModel: string;
  /** General-review reasoning effort (`GENERAL_EFFORT`). */
  readonly generalEffort: string;
  /** Security-review reasoning effort (`SECURITY_EFFORT`). */
  readonly securityEffort: string;
  /** Confirmation reasoning effort (`CONFIRM_EFFORT`). */
  readonly confirmEffort: string;
}

/** Validated, normalized per-stage config. */
export interface ReviewConfig {
  readonly general: {
    readonly models: string[];
    readonly effort: ReasoningEffort;
  };
  readonly security: {
    readonly models: string[];
    readonly effort: ReasoningEffort;
  };
  readonly confirm: {
    readonly model: string;
    readonly effort: ReasoningEffort;
  };
}

function isReasoningEffort(value: string): value is ReasoningEffort {
  return (REASONING_EFFORTS as readonly string[]).includes(value);
}

/**
 * Parses a comma-separated model list. A stage may list a single model, but the
 * list must be non-blank and free of duplicates. `varName` names the offending
 * variable in thrown errors.
 */
function parseModelList(raw: string, varName: string): string[] {
  const models = raw
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);

  if (models.length < 1) {
    throw new Error(`${varName} must list at least one model ID.`);
  }

  if (new Set(models).size !== models.length) {
    throw new Error(`${varName} must not contain duplicate model IDs.`);
  }

  return models;
}

/** Validates one reasoning-effort string. `varName` names it in errors. */
function parseEffort(raw: string, varName: string): ReasoningEffort {
  const effort = raw.trim();
  if (!isReasoningEffort(effort)) {
    throw new Error(
      `${varName} must be one of: ${REASONING_EFFORTS.join('|')}.`,
    );
  }
  return effort;
}

/**
 * Validates raw model config. Throws a clear {@link Error} (naming the offending
 * variable) on any shape problem; returns the normalized {@link ReviewConfig}
 * on success. Performs format/shape checks only — whether a model is available
 * on the Copilot plan is not (and cannot be) checked here.
 */
export function validateReviewConfig(raw: RawReviewConfig): ReviewConfig {
  const confirmModel = raw.confirmModel.trim();
  if (confirmModel.length === 0) {
    throw new Error('CONFIRM_MODEL must be a single non-blank model ID.');
  }

  return {
    general: {
      models: parseModelList(raw.generalModels, 'GENERAL_MODELS'),
      effort: parseEffort(raw.generalEffort, 'GENERAL_EFFORT'),
    },
    security: {
      models: parseModelList(raw.securityModels, 'SECURITY_MODELS'),
      effort: parseEffort(raw.securityEffort, 'SECURITY_EFFORT'),
    },
    confirm: {
      model: confirmModel,
      effort: parseEffort(raw.confirmEffort, 'CONFIRM_EFFORT'),
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test --filter @omnicraft/ai-review-core`
Expected: PASS — all 9 cases green.

- [ ] **Step 5: Commit**

```bash
git add packages/ai-review-core/src/config.ts packages/ai-review-core/src/config.test.ts
git commit -m "feat(ai-review-core): per-stage nested review config with validation helpers"
```

---

## Task 2: Emit two model-list outputs from check-config

**Files:**

- Modify: `scripts/src/ai-review/check-config.ts`

This is an orchestration script that runs only inside GitHub Actions; it has no
unit test. Verification is a type-check + the workflow run. Confirm the package
exposes a `typecheck` script before relying on it.

- [ ] **Step 1: Rewrite `check-config.ts`**

Replace the entire contents of `scripts/src/ai-review/check-config.ts` with:

```ts
import {validateReviewConfig} from '@omnicraft/ai-review-core';

import {fail, optionalEnv, setOutput} from './shared/gha.js';

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
      generalModels: optionalEnv('GENERAL_MODELS'),
      securityModels: optionalEnv('SECURITY_MODELS'),
      confirmModel: optionalEnv('CONFIRM_MODEL'),
      generalEffort: optionalEnv('GENERAL_EFFORT'),
      securityEffort: optionalEnv('SECURITY_EFFORT'),
      confirmEffort: optionalEnv('CONFIRM_EFFORT'),
    });
    setOutput('general_models_json', JSON.stringify(config.general.models));
    setOutput('security_models_json', JSON.stringify(config.security.models));
    console.log(
      `Config OK. General: ${config.general.models.join(', ')} ` +
        `(${config.general.effort}); ` +
        `security: ${config.security.models.join(', ')} ` +
        `(${config.security.effort}); ` +
        `confirm: ${config.confirm.model} (${config.confirm.effort}).`,
    );
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

main();
```

- [ ] **Step 2: Type-check the scripts package**

Run: `bun run --filter @omnicraft/scripts typecheck` (the scripts package defines `"typecheck": "tsc --noEmit"`). If the package name differs, run `cd scripts && bun run typecheck`.
Expected: PASS — no type errors and no output.

- [ ] **Step 3: Commit**

```bash
git add scripts/src/ai-review/check-config.ts
git commit -m "feat(ai-review): read per-stage env vars and emit two model-list outputs"
```

---

## Task 3: Create the run-review-pass composite action

**Files:**

- Create: `.github/actions/run-review-pass/action.yml`

This action owns the entire review pipeline (checkout PR head, fetch base,
install deps, install Copilot CLI, run the pass, verify the report). It is the
single source of truth that both review jobs call. Lifted verbatim from the
current `review` job body in `ai-review.yml`, parameterized via inputs.

- [ ] **Step 1: Create `.github/actions/run-review-pass/action.yml`**

```yaml
name: Run review pass
description: Prepare the PR head and run one Copilot review pass, verifying a non-empty report.

inputs:
  model:
    description: Reviewer model ID
    required: true
  effort:
    description: Reasoning effort level for this pass
    required: true
  pass:
    description: Review pass name (general | security); selects the prompt file
    required: true
  head-sha:
    description: PR head SHA to check out
    required: true
  base-sha:
    description: PR base SHA for the diff range
    required: true
  base-ref:
    description: PR base ref to fetch
    required: true
  pr-number:
    description: PR number
    required: true
  repo:
    description: owner/name of the repository
    required: true
  github-token:
    description: GITHUB_TOKEN for the agent's gh calls
    required: true
  copilot-token:
    description: Copilot Requests PAT (COPILOT_CLI_TOKEN secret)
    required: true

runs:
  using: composite
  steps:
    - name: Checkout PR head
      uses: actions/checkout@v7
      with:
        ref: ${{ inputs.head-sha }}
        path: pr-head
        fetch-depth: 0
    - name: Fetch base for diff range
      shell: bash
      run: git -C pr-head fetch --no-tags origin -- "${BASE_REF}"
      env:
        BASE_REF: ${{ inputs.base-ref }}
    - name: Install deps in pr-head
      shell: bash
      run: bun install --frozen-lockfile
      working-directory: pr-head
    - name: Install Copilot CLI
      shell: bash
      run: npm install -g @github/copilot
    - name: Review pass
      shell: bash
      run: |
        PROMPT="$(cat "$GITHUB_WORKSPACE/scripts/src/ai-review/prompts/review-$PASS.md")

        Repository: $GH_REPO
        PR number: $PR_NUMBER
        Review the full diff of this PR against its base: run
        \`git diff $BASE_SHA...HEAD\` (three-dot) inside pr-head.

        Report file: $REPORT_FILE"
        copilot --model "$MODEL" --effort "$EFFORT" \
          --context long_context \
          --allow-tool 'shell,read,write' \
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
        MODEL: ${{ inputs.model }}
        EFFORT: ${{ inputs.effort }}
        PASS: ${{ inputs.pass }}
        COPILOT_GITHUB_TOKEN: ${{ inputs.copilot-token }}
        GH_TOKEN: ${{ inputs.github-token }}
        GH_REPO: ${{ inputs.repo }}
        PR_NUMBER: ${{ inputs.pr-number }}
        BASE_SHA: ${{ inputs.base-sha }}
        REPORT_FILE: ${{ github.workspace }}/report-${{ inputs.pass }}-${{ inputs.model }}.md
    - name: Upload report
      uses: actions/upload-artifact@v7
      with:
        name: reports-${{ inputs.pass }}-${{ inputs.model }}
        path: report-${{ inputs.pass }}-${{ inputs.model }}.md
        if-no-files-found: error
```

- [ ] **Step 2: Lint the YAML for syntax**

Run: `bunx yaml-lint .github/actions/run-review-pass/action.yml` if available; otherwise visually confirm indentation. Expected: no parse error. (Full validation happens when the workflow runs in Task 4.)

- [ ] **Step 3: Commit**

```bash
git add .github/actions/run-review-pass/action.yml
git commit -m "feat(ci): add run-review-pass composite action for review pipeline"
```

---

## Task 4: Split the review job and rewire the workflow

**Files:**

- Modify: `.github/workflows/ai-review.yml`

- [ ] **Step 1: Replace the top-level `env:` block**

Find (lines ~10-13):

```yaml
env:
  REVIEWER_MODELS: ${{ vars.AI_REVIEW_REVIEWER_MODELS || 'gpt-5.5,claude-opus-4.8' }}
  CONFIRM_MODEL: ${{ vars.AI_REVIEW_CONFIRM_MODEL || 'claude-opus-4.8' }}
  REASONING_EFFORT: ${{ vars.AI_REVIEW_EFFORT || 'xhigh' }}
```

Replace with:

```yaml
env:
  GENERAL_MODELS: ${{ vars.AI_REVIEW_GENERAL_MODELS || 'gpt-5.5,claude-opus-4.8' }}
  SECURITY_MODELS: ${{ vars.AI_REVIEW_SECURITY_MODELS || 'gpt-5.5,claude-opus-4.8' }}
  CONFIRM_MODEL: ${{ vars.AI_REVIEW_CONFIRM_MODEL || 'claude-opus-4.8' }}
  GENERAL_EFFORT: ${{ vars.AI_REVIEW_GENERAL_EFFORT || 'xhigh' }}
  SECURITY_EFFORT: ${{ vars.AI_REVIEW_SECURITY_EFFORT || 'xhigh' }}
  CONFIRM_EFFORT: ${{ vars.AI_REVIEW_CONFIRM_EFFORT || 'xhigh' }}
```

- [ ] **Step 2: Update the `config` job outputs**

Find in the `config` job:

```yaml
outputs:
  reviewer_models_json: ${{ steps.check.outputs.reviewer_models_json }}
```

Replace with:

```yaml
outputs:
  general_models_json: ${{ steps.check.outputs.general_models_json }}
  security_models_json: ${{ steps.check.outputs.security_models_json }}
```

- [ ] **Step 3: Replace the entire `review` job with two jobs**

Delete the whole `review:` job (from `  review:` through its `Upload report` step, lines ~56-123) and replace with:

```yaml
general-review:
  name: General review (${{ matrix.model }})
  needs: [config, prepare]
  if: needs.prepare.outputs.has_changes == 'true'
  runs-on: ubuntu-latest
  permissions:
    contents: read
    pull-requests: read
  strategy:
    fail-fast: false
    matrix:
      model: ${{ fromJSON(needs.config.outputs.general_models_json) }}
  steps:
    - uses: actions/checkout@v7
    - uses: ./.github/actions/setup
    - uses: ./.github/actions/run-review-pass
      with:
        model: ${{ matrix.model }}
        effort: ${{ env.GENERAL_EFFORT }}
        pass: general
        head-sha: ${{ needs.prepare.outputs.head_sha }}
        base-sha: ${{ github.event.pull_request.base.sha }}
        base-ref: ${{ github.event.pull_request.base.ref }}
        pr-number: ${{ needs.prepare.outputs.pr_number }}
        repo: ${{ github.repository }}
        github-token: ${{ github.token }}
        copilot-token: ${{ secrets.COPILOT_CLI_TOKEN }}

security-review:
  name: Security review (${{ matrix.model }})
  needs: [config, prepare]
  if: needs.prepare.outputs.has_changes == 'true'
  runs-on: ubuntu-latest
  permissions:
    contents: read
    pull-requests: read
  strategy:
    fail-fast: false
    matrix:
      model: ${{ fromJSON(needs.config.outputs.security_models_json) }}
  steps:
    - uses: actions/checkout@v7
    - uses: ./.github/actions/setup
    - uses: ./.github/actions/run-review-pass
      with:
        model: ${{ matrix.model }}
        effort: ${{ env.SECURITY_EFFORT }}
        pass: security
        head-sha: ${{ needs.prepare.outputs.head_sha }}
        base-sha: ${{ github.event.pull_request.base.sha }}
        base-ref: ${{ github.event.pull_request.base.ref }}
        pr-number: ${{ needs.prepare.outputs.pr_number }}
        repo: ${{ github.repository }}
        github-token: ${{ github.token }}
        copilot-token: ${{ secrets.COPILOT_CLI_TOKEN }}
```

- [ ] **Step 4: Rewire the `confirm` job's `needs`, guard, and effort**

Find the `confirm` job header:

```yaml
confirm:
  name: Confirm & post review
  needs: [config, prepare, review]
  if: needs.prepare.outputs.has_changes == 'true' && needs.review.result == 'success'
```

Replace with:

```yaml
confirm:
  name: Confirm & post review
  needs: [config, prepare, general-review, security-review]
  if: needs.prepare.outputs.has_changes == 'true' && needs.general-review.result == 'success' && needs.security-review.result == 'success'
```

Then in the `Confirm and post` step, find:

```yaml
copilot --model "$CONFIRM_MODEL" --effort "$REASONING_EFFORT" \
```

Replace with:

```yaml
copilot --model "$CONFIRM_MODEL" --effort "$CONFIRM_EFFORT" \
```

(The `CONFIRM_MODEL` and `CONFIRM_EFFORT` env vars flow from the top-level `env:` block, so no per-step `env:` addition is needed. The `download-artifact` pattern `reports-*` is unchanged.)

- [ ] **Step 5: Rewire the `gate` job**

Find the `gate` job's `needs`:

```yaml
needs: [config, prepare, review, confirm]
```

Replace with:

```yaml
needs: [config, prepare, general-review, security-review, confirm]
```

Then in the `Decide gate` step's `env:`, find:

```yaml
REVIEW_RESULT: ${{ needs.review.result }}
```

Replace with:

```yaml
GENERAL_REVIEW_RESULT: ${{ needs.general-review.result }}
SECURITY_REVIEW_RESULT: ${{ needs.security-review.result }}
```

- [ ] **Step 6: Update gate.ts to read both review-job results**

`gate.ts` builds an `upstream: JobResult[]` array and blocks if `.some()` of
them failed (`scripts/src/ai-review/gate.ts:53-59`). The single `REVIEW_RESULT`
entry becomes two entries — one per review job. Because both feed the same
`anyUpstreamFailed = upstream.some(isFailedOrCancelled)` check, the review stage
blocks the gate when **either** job fails, which is the desired semantics.

Find (lines 53-58):

```ts
const upstream: JobResult[] = [
  normalizeJobResult(optionalEnv('CONFIG_RESULT')),
  normalizeJobResult(optionalEnv('PREPARE_RESULT')),
  normalizeJobResult(optionalEnv('REVIEW_RESULT')),
  normalizeJobResult(optionalEnv('CONFIRM_RESULT')),
];
```

Replace with:

```ts
const upstream: JobResult[] = [
  normalizeJobResult(optionalEnv('CONFIG_RESULT')),
  normalizeJobResult(optionalEnv('PREPARE_RESULT')),
  normalizeJobResult(optionalEnv('GENERAL_REVIEW_RESULT')),
  normalizeJobResult(optionalEnv('SECURITY_REVIEW_RESULT')),
  normalizeJobResult(optionalEnv('CONFIRM_RESULT')),
];
```

- [ ] **Step 7: Validate workflow YAML parses**

Run: `bunx yaml-lint .github/workflows/ai-review.yml` if available; otherwise confirm no editor parse errors. Expected: no parse error.

- [ ] **Step 8: Commit**

```bash
git add .github/workflows/ai-review.yml scripts/src/ai-review/gate.ts
git commit -m "feat(ci): split AI review into general/security jobs with per-stage effort"
```

---

## Task 5: Update the README Variables list

**Files:**

- Modify: `scripts/src/ai-review/README.md`

- [ ] **Step 1: Replace the optional-Variables bullet list**

Find (item 3 in "Maintainer prerequisites"):

```markdown
3. (Optional) Set repository **Variables** to override model defaults without
   editing the workflow, and confirm they are available on the Copilot plan:
   - `AI_REVIEW_REVIEWER_MODELS` (comma-separated, e.g. `gpt-5.5,claude-opus-4.8`)
   - `AI_REVIEW_CONFIRM_MODEL` (e.g. `claude-opus-4.8`)
   - `AI_REVIEW_EFFORT` (`none|low|medium|high|xhigh|max`)
```

Replace with:

```markdown
3. (Optional) Set repository **Variables** to override per-stage model and effort
   defaults without editing the workflow, and confirm the models are available on
   the Copilot plan. Each stage is configured independently:
   - `AI_REVIEW_GENERAL_MODELS` (comma-separated, e.g. `gpt-5.5,claude-opus-4.8`)
   - `AI_REVIEW_SECURITY_MODELS` (comma-separated, e.g. `gpt-5.5,claude-opus-4.8`)
   - `AI_REVIEW_CONFIRM_MODEL` (single, e.g. `claude-opus-4.8`)
   - `AI_REVIEW_GENERAL_EFFORT` (`none|low|medium|high|xhigh|max`)
   - `AI_REVIEW_SECURITY_EFFORT` (`none|low|medium|high|xhigh|max`)
   - `AI_REVIEW_CONFIRM_EFFORT` (`none|low|medium|high|xhigh|max`)

   A model list may contain a single model. Unset variables fall back to the
   defaults above (general & security `gpt-5.5,claude-opus-4.8`; confirm
   `claude-opus-4.8`; all efforts `xhigh`), i.e. today's behavior.
```

- [ ] **Step 2: Scan the rest of the README for stale shared-config prose**

Run: `grep -n "REVIEWER_MODELS\|AI_REVIEW_EFFORT\|single effort\|shared" scripts/src/ai-review/README.md`
Expected: no remaining references to the old `AI_REVIEW_REVIEWER_MODELS` / `AI_REVIEW_EFFORT` names or prose implying one shared effort. If any appear (outside the block just edited), update them to reflect per-stage config.

- [ ] **Step 3: Commit**

```bash
git add scripts/src/ai-review/README.md
git commit -m "docs(ai-review): document per-stage model and effort Variables"
```

---

## Final verification

- [ ] **Step 1: Run the core package tests**

Run: `bun run test --filter @omnicraft/ai-review-core`
Expected: PASS — all config tests green.

- [ ] **Step 2: Type-check**

Run: `bun run --filter @omnicraft/scripts typecheck`
Expected: PASS — no type errors across check-config.ts and gate.ts. (config.ts is type-checked by the core package's own test/build run in Step 1.)

- [ ] **Step 3: Confirm no stale identifiers remain**

Run: `grep -rn "reviewer_models_json\|REVIEWER_MODELS\|REASONING_EFFORT\b\|AI_REVIEW_EFFORT\|reviewerModels\|reasoningEffort" scripts .github packages docs/superpowers/specs/2026-06-20-ai-review-per-stage-config-design.md`
Expected: no matches in `scripts/`, `.github/`, or `packages/` (the spec file may mention old names in its Background section — that is acceptable historical context). Any hit in live code is a missed rename — fix it.

---

## Notes for the implementer

- **Test command:** always `bun run test` (Vitest). Never `bun test` (Bun's own runner produces false failures in this repo).
- **Runtime APIs:** code uses Node.js APIs only (`node:fs`, etc.), never `Bun.*`. Not relevant to these tasks but holds if you touch shared helpers.
- **No real workflow run in this plan.** GitHub Actions changes (Tasks 3–4) are verified by YAML parse + the rename-consistency grep. The actual end-to-end review only runs when a PR is opened against the repo; the maintainer's manual checklist in the README covers that.
- **Prompts unchanged:** `prompts/review-general.md`, `prompts/review-security.md`, `prompts/confirm.md` already exist and are correct. Do not edit them.
