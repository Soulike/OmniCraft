# AI Review: per-stage model + effort configuration

Follow-up from #295 (issue #298). Makes the existing AI-review knobs finer-grained:
each of the three stages — **general review**, **security review**, **confirm** —
gets its own model(s) and its own reasoning effort. Purely a configuration
refactor: with no repository Variables set, behavior is identical to today.

## Background

The AI review gate (`scripts/src/ai-review/`, `.github/workflows/ai-review.yml`,
`@omnicraft/ai-review-core`) currently shares config across stages:

- one reviewer model list (`AI_REVIEW_REVIEWER_MODELS`) drives both the general
  and security passes;
- one effort (`AI_REVIEW_EFFORT`) is used by every stage including confirm.

We want each stage independently configurable.

## Config surface

Variable names follow the issue #298 table. Defaults are unchanged from today.

| Stage    | Models variable                               | Default                   | Effort variable             | Default |
| -------- | --------------------------------------------- | ------------------------- | --------------------------- | ------- |
| general  | `AI_REVIEW_GENERAL_MODELS` (comma-separated)  | `gpt-5.5,claude-opus-4.8` | `AI_REVIEW_GENERAL_EFFORT`  | `xhigh` |
| security | `AI_REVIEW_SECURITY_MODELS` (comma-separated) | `gpt-5.5,claude-opus-4.8` | `AI_REVIEW_SECURITY_EFFORT` | `xhigh` |
| confirm  | `AI_REVIEW_CONFIRM_MODEL` (single)            | `claude-opus-4.8`         | `AI_REVIEW_CONFIRM_EFFORT`  | `xhigh` |

Setting no Variables behaves exactly as now — only the old single
`AI_REVIEW_EFFORT` / `AI_REVIEW_REVIEWER_MODELS` names are replaced.

## Decided design (from #295 — not relitigated)

- **Two review jobs, not one matrix.** The single `review` job splits into
  `general-review` and `security-review`, each with its own `matrix.model` from
  its own model list. The old 2-D `model × pass` matrix cannot express two
  different model lists; `include`-array generation was rejected as more complex
  than two clear jobs. Some YAML duplication between the two review jobs is
  acceptable.
- **Defaults unchanged** (see table). Unconfigured = today's behavior.

## Changes

### 1. `packages/ai-review-core/src/config.ts` — nested shape + helpers

Config expands from (1 model list + 1 confirm model + 1 effort) to
(2 model lists + 1 confirm model + 3 efforts). Stages are modeled as **nested
objects** to express "each stage is independently configured":

```ts
interface RawReviewConfig {
  generalModels: string;
  securityModels: string;
  confirmModel: string;
  generalEffort: string;
  securityEffort: string;
  confirmEffort: string;
}

interface ReviewConfig {
  general: {models: string[]; effort: ReasoningEffort};
  security: {models: string[]; effort: ReasoningEffort};
  confirm: {model: string; effort: ReasoningEffort};
}
```

Validation logic is identical across the two model lists and across the three
efforts, so it is factored into helpers that take the offending variable name so
error messages point at the right variable:

- `parseModelList(raw: string, varName: string): string[]` — split / trim /
  filter-blank / distinct check. The old `>= 2` distinct-models requirement is
  **relaxed to `>= 1`** (per issue #298: a stage may legitimately want a single
  model). The distinct (no-duplicate) and non-blank checks are kept. Called once
  for general, once for security.
- `parseEffort(raw: string, varName: string): ReasoningEffort` — reuses the
  existing `isReasoningEffort`; error message names the variable. Called once per
  effort.

`confirmModel` keeps its single non-blank check. `REASONING_EFFORTS`,
`ReasoningEffort`, and `isReasoningEffort` are unchanged.

### 2. `packages/ai-review-core/src/config.test.ts`

Rewritten for the nested shape. Cases:

- parses a full valid config into the nested shape;
- **single-model list is accepted** (covers the relaxed `>= 1`);
- general and security each: empty list throws (naming that variable), duplicate
  list throws;
- `confirmModel` blank throws;
- each of the three efforts: invalid level throws (naming that variable);
- `REASONING_EFFORTS` exposure test retained.

### 3. `scripts/src/ai-review/check-config.ts`

Reads the six new env vars, validates via `validateReviewConfig`, and emits two
model-list outputs — `general_models_json` and `security_models_json` — instead
of the single `reviewer_models_json`. Log line reports all three stages' models
and efforts.

### 4. New `.github/actions/run-review-pass/action.yml` (composite)

Single source of truth for running one review pass. Encapsulates the whole
review pipeline:

1. checkout PR head into `pr-head`;
2. fetch base ref for the diff range;
3. install deps (`bun install --frozen-lockfile`);
4. install Copilot CLI;
5. run `copilot` with all the fixed flags (`--context long_context`,
   `--allow-tool 'shell,read,write'`, `--allow-all-urls`,
   `--secret-env-vars COPILOT_GITHUB_TOKEN`, `--add-dir`, `-C pr-head`), using
   prompt `prompts/review-<pass>.md`;
6. verify the report file is non-empty — fail the step otherwise (this check is
   intrinsic to a review pass, so it lives in the action, not behind a flag).

Inputs: `model`, `effort`, `pass` (selects the prompt file and the report /
artifact name), `head-sha`, `base-sha`, `base-ref`, `pr-number`, `repo`,
`copilot-token`. The Copilot secret is passed in as an input because composite
actions cannot read `secrets` directly.

Scope note: this action serves the two **review** jobs only. The `confirm` job
is deliberately **not** routed through it — confirm does a materially different
job (download reviewer artifacts, then write a PR review), so sharing the
pipeline would couple unrelated logic. Confirm keeps its own steps.

### 5. `.github/workflows/ai-review.yml`

- `env:` — replace the three shared vars with the six per-stage vars (general /
  security models + efforts, confirm model + effort), each with the table's
  default.
- `config` job — output `general_models_json` and `security_models_json`.
- `review` job — split into `general-review` and `security-review`. Each has
  `strategy.matrix.model: fromJSON(needs.config.outputs.<stage>_models_json)`
  and a body that reduces to one step: `uses: ./.github/actions/run-review-pass`
  with its fixed `pass` (`general` / `security`) and its `effort`. Artifact name
  stays `reports-<pass>-<model>`. (`matrix` must stay in the calling job — GHA
  composite actions cannot contain a matrix — which is why there are still two
  jobs.)
- `confirm` job — unchanged structure (download `reports-*`, write the PR
  review). `needs` becomes `[config, prepare, general-review, security-review]`;
  the success guard becomes both review jobs succeeding. Its `--effort` uses
  `CONFIRM_EFFORT`. Download pattern `reports-*` is unchanged (still catches all
  stage/model artifacts).
- `gate` job — `needs` and the `*_RESULT` env wiring updated to reference the two
  review jobs in place of the single `review`.

### 6. `scripts/src/ai-review/README.md`

Update the maintainer Variables list (item 3) to the six new variables and adjust
any prose describing the shared effort/model.

## Out of scope

No behavior change when unconfigured. The dedup / gate / marker logic is
untouched. Prompt files (`review-general.md`, `review-security.md`, `confirm.md`)
are already separated and need no changes.
