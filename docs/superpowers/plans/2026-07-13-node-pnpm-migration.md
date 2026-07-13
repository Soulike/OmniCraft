# Node.js and PNPM Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Bun with Node.js 24 or newer and PNPM `^11.12.0` across local development, runtime scripts, hooks, and GitHub automation.

**Architecture:** PNPM owns workspace discovery, catalogs, dependency installation, and lockfile state. Node.js 24 natively strips erasable types from repository scripts and their source-level workspace dependencies; the backend alone uses the local `tsx` development dependency to preserve its existing `.js` import specifiers and TypeScript path aliases.

**Tech Stack:** Node.js 24+, PNPM 11.12+, TypeScript, tsx, GitHub Actions, Husky, Vitest, Vite.

---

## File map

- Create `pnpm-workspace.yaml`: PNPM workspace globs and shared dependency catalog.
- Create `pnpm-lock.yaml`: generated PNPM dependency and package-manager resolution.
- Delete `bun.lock`: obsolete Bun dependency lock.
- Modify `package.json`: version policy and PNPM/Node orchestration.
- Modify `apps/backend/package.json`: Node runtime commands and backend `tsx` dependency.
- Modify `scripts/tsconfig.json`, `packages/free-ports/tsconfig.json`, and `packages/ai-review-core/tsconfig.json`: enforce Node-erasable TypeScript and permit explicit `.ts` imports.
- Modify relative imports under `scripts/src`, `packages/free-ports/src`, and `packages/ai-review-core/src`: make native Node source resolution explicit.
- Modify `.github/actions/setup/action.yml`: deterministic Node/PNPM setup and store caching.
- Modify `.github/actions/run-review-pass/action.yml`: PNPM install for checked-out PR heads.
- Modify `.github/workflows/ci.yml`: PNPM change detection and verification commands.
- Modify `.github/workflows/ai-review.yml`: Node execution and PNPM installs.
- Modify `.husky/commit-msg` and `.husky/pre-commit`: PNPM binary execution.
- Modify `CLAUDE.md`, `apps/backend/CLAUDE.md`, and `.claude/skills/dev-server/SKILL.md`: active toolchain guidance.
- Modify `.gitignore`: package-manager-neutral dependency comment.
- Modify `apps/backend/src/agent-core/llm-session/sanitize-reminder.ts`: remove the obsolete Bun-specific convention reference.

### Task 1: Establish the PNPM workspace and version policy

**Files:**

- Create: `pnpm-workspace.yaml`
- Create: `pnpm-lock.yaml`
- Delete: `bun.lock`
- Modify: `package.json`
- Modify: `apps/backend/package.json`

- [ ] **Step 1: Record the pre-migration PNPM failure**

Run:

```bash
pnpm install --lockfile-only
```

Expected: FAIL because PNPM cannot read the root `catalog:` dependencies without a `pnpm-workspace.yaml`; it also warns that the root `workspaces` field is unsupported.

- [ ] **Step 2: Create PNPM workspace and catalog configuration**

Create `pnpm-workspace.yaml` with the existing workspace boundaries and catalog values:

```yaml
packages:
  - apps/*
  - packages/*
  - configs/*
  - scripts

catalog:
  '@types/node': ^24.12.0
  eslint: ^10.5.0
  typescript: ^6.0.3
  vitest: ^4.1.8
  zod: ^4.3.6
```

- [ ] **Step 3: Move root metadata to PNPM conventions**

In `package.json`:

1. Remove the `workspaces` and `catalog` fields.
2. Remove `@types/bun` from `devDependencies`.
3. Add these fields directly after `private`:

```json
"engines": {
  "node": ">=24"
},
"devEngines": {
  "packageManager": {
    "name": "pnpm",
    "version": "^11.12.0",
    "onFail": "error"
  }
},
```

- [ ] **Step 4: Add `tsx` through PNPM**

Run:

```bash
pnpm --filter '@omnicraft/backend' add --save-dev --save-catalog tsx
```

Expected: `tsx` is added as `"catalog:"` only in backend `devDependencies`, and its resolved range is added to the default catalog in `pnpm-workspace.yaml`. Do not manually type the registry version.

- [ ] **Step 5: Replace the lockfile**

Run:

```bash
rm bun.lock
pnpm install
pnpm install --frozen-lockfile
```

Expected: `pnpm-lock.yaml` is generated, contains the workspace importers and `packageManagerDependencies`, and the frozen reinstall succeeds.

- [ ] **Step 6: Verify the version contract**

Run:

```bash
pnpm --version
node --version
pnpm --filter '@omnicraft/backend' exec tsx --version
```

Expected: PNPM reports a version in `>=11.12.0 <12.0.0`, Node reports 24 or newer, and `tsx` reports its installed version.

- [ ] **Step 7: Commit workspace metadata**

```bash
git add package.json apps/backend/package.json pnpm-workspace.yaml pnpm-lock.yaml bun.lock
git commit -m "build: migrate workspace dependencies to PNPM"
```

### Task 2: Run repository scripts natively and backend TypeScript with Node.js

**Files:**

- Modify: `package.json`
- Modify: `apps/backend/package.json`
- Modify: `scripts/tsconfig.json`
- Modify: `packages/free-ports/tsconfig.json`
- Modify: `packages/ai-review-core/tsconfig.json`
- Modify: TypeScript imports under `scripts/src`, `packages/free-ports/src`, and `packages/ai-review-core/src`

- [ ] **Step 1: Reproduce native Node's import-resolution failure**

Run:

```bash
npx --yes node@24.18.0 scripts/src/with-free-ports.ts
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `packages/free-ports/src/free-ports.js`. Node strips the TypeScript syntax but does not reinterpret a `.js` specifier as a `.ts` source file.

- [ ] **Step 2: Enforce erasable syntax and explicit TypeScript imports**

Add these options inside `compilerOptions` in `scripts/tsconfig.json`, `packages/free-ports/tsconfig.json`, and `packages/ai-review-core/tsconfig.json`:

```json
"allowImportingTsExtensions": true,
"erasableSyntaxOnly": true,
```

These projects typecheck with `tsc --noEmit`, satisfying the TypeScript requirement for `allowImportingTsExtensions`.

- [ ] **Step 3: Make native source resolution explicit**

In every TypeScript file under these three source trees, change relative import and export specifier suffixes from `.js` to `.ts`:

```text
scripts/src/**/*.ts
packages/free-ports/src/**/*.ts
packages/ai-review-core/src/**/*.ts
```

Apply this exact transformation to both runtime files and tests:

```typescript
import {value} from './module.js';
export {value} from './module.js';
```

becomes:

```typescript
import {value} from './module.ts';
export {value} from './module.ts';
```

Do not change package imports such as `@omnicraft/free-ports` or external dependencies.

- [ ] **Step 4: Prove scripts execute directly on Node 24**

Run:

```bash
npx --yes node@24.18.0 scripts/src/with-free-ports.ts
COPILOT_CLI_TOKEN='' npx --yes node@24.18.0 scripts/src/ai-review/check-config.ts
```

Expected: the first command reaches the script's own `Usage: with-free-ports` validation and the second reaches its own missing-secret error. Neither command reports a TypeScript syntax or module-resolution error.

- [ ] **Step 5: Convert root orchestration scripts**

Replace the Bun-dependent root scripts in `package.json` with:

```json
"lint:all": "pnpm --recursive --if-present run lint",
"typecheck:all": "pnpm --recursive --if-present run typecheck",
"dev": "node scripts/src/with-free-ports.ts pnpm --filter './apps/*' --parallel run dev",
"build:frontend": "pnpm --filter '@omnicraft/frontend' run build",
"start": "pnpm run build:frontend && pnpm --filter '@omnicraft/backend' run start"
```

- [ ] **Step 6: Convert backend runtime scripts**

Replace the backend `dev` and `start` scripts in `apps/backend/package.json` with:

```json
"dev": "NODE_ENV=development tsx watch --env-file-if-exists=.env src/index.ts",
"start": "NODE_ENV=production tsx --env-file-if-exists=.env src/index.ts"
```

- [ ] **Step 7: Prove the backend launcher resolves existing source imports**

Run:

```bash
pnpm --filter '@omnicraft/backend' exec tsx src/startup/init-services.ts
```

Expected: PASS with exit code 0 and no module-resolution error.

- [ ] **Step 8: Prove PNPM workspace orchestration works**

Run:

```bash
pnpm lint:all
pnpm typecheck:all
```

Expected: all workspaces with the corresponding script pass; packages without a script are skipped.

- [ ] **Step 9: Commit runtime scripts and native imports**

```bash
git add package.json apps/backend/package.json scripts/tsconfig.json scripts/src packages/free-ports/tsconfig.json packages/free-ports/src packages/ai-review-core/tsconfig.json packages/ai-review-core/src
git commit -m "build: run TypeScript workloads on Node.js"
```

### Task 3: Update hooks and active contributor guidance

**Files:**

- Modify: `.husky/commit-msg`
- Modify: `.husky/pre-commit`
- Modify: `CLAUDE.md`
- Modify: `apps/backend/CLAUDE.md`
- Modify: `.claude/skills/dev-server/SKILL.md`
- Modify: `.gitignore`
- Modify: `apps/backend/src/agent-core/llm-session/sanitize-reminder.ts`

- [ ] **Step 1: Capture active Bun references**

Run:

```bash
rg -n '\b[Bb]un\b|bunx|Bun\.' .husky CLAUDE.md apps/backend/CLAUDE.md .claude/skills/dev-server/SKILL.md .gitignore apps/backend/src/agent-core/llm-session/sanitize-reminder.ts
```

Expected: matches identify the hooks, contributor instructions, dev-server skill, dependency comment, and runtime-specific source comment that still describe Bun.

- [ ] **Step 2: Convert Husky hooks**

Set `.husky/pre-commit` to:

```sh
#!/usr/bin/env sh
pnpm exec lint-staged --concurrent false
```

Set `.husky/commit-msg` to:

```sh
#!/usr/bin/env sh
pnpm exec commitlint --edit ${1}
```

- [ ] **Step 3: Update root contributor instructions**

In `CLAUDE.md`:

1. Replace the opening description with `This is a Node.js monorepo managed with PNPM.`
2. Delete the `## Bun Doc` section.
3. Change the dependency example to `pnpm add <package>`.
4. Replace the runtime paragraph with:

```markdown
## Runtime APIs

- Node.js is the runtime. Use Node.js APIs (for example,
  `node:fs/promises` and `node:path`) and do not introduce APIs tied to an
  alternative JavaScript runtime.
```

- [ ] **Step 4: Update backend and dev-server instructions**

In `apps/backend/CLAUDE.md`, set the runtime and environment bullets to:

```markdown
- Runtime: Node.js with `tsx` for source TypeScript execution
- Config: `.env` loaded when present through Node.js
  `--env-file-if-exists=.env`; see `.env.example` for available variables
```

In `.claude/skills/dev-server/SKILL.md`, change the start command to:

```bash
pnpm dev
```

Replace its first note with:

```markdown
- The root `dev` script allocates free ports, then runs
  `pnpm --filter './apps/*' --parallel run dev` to start all apps in parallel.
```

- [ ] **Step 5: Remove remaining active Bun wording**

Change the first `.gitignore` comment to:

```gitignore
# dependencies
```

In `sanitize-reminder.ts`, replace the end of the explanatory paragraph with:

```typescript
 * primitive, so the project uses the focused `escape-html` dependency.
```

- [ ] **Step 6: Verify the active guidance scan is clean**

Run the Step 1 `rg` command again.

Expected: no matches and exit code 1 from `rg` because active operational guidance no longer references Bun.

- [ ] **Step 7: Commit hooks and guidance**

```bash
git add .husky CLAUDE.md apps/backend/CLAUDE.md .claude/skills/dev-server/SKILL.md .gitignore apps/backend/src/agent-core/llm-session/sanitize-reminder.ts
git commit -m "docs: update tooling guidance for Node and PNPM"
```

### Task 4: Migrate GitHub automation

**Files:**

- Modify: `.github/actions/setup/action.yml`
- Modify: `.github/actions/run-review-pass/action.yml`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/ai-review.yml`

- [ ] **Step 1: Capture automation references to Bun**

Run:

```bash
rg -n '\b[Bb]un\b|bunx|bun\.lock|setup-bun' .github
```

Expected: matches in the shared setup action, CI, AI-review workflow, and review-pass action.

- [ ] **Step 2: Replace the shared setup action**

Set `.github/actions/setup/action.yml` to:

```yaml
name: Setup Node.js & PNPM
description: Setup Node.js and PNPM, restore the PNPM store, and install dependencies

runs:
  using: composite
  steps:
    - uses: pnpm/action-setup@v4
      with:
        version: 11.12.0

    - uses: actions/setup-node@v6
      with:
        node-version: 24
        cache: pnpm
        cache-dependency-path: pnpm-lock.yaml

    - name: Install dependencies
      run: pnpm install --frozen-lockfile
      shell: bash
```

- [ ] **Step 3: Convert CI workflow commands and filters**

In both `backend` and `frontend` path filters in `.github/workflows/ci.yml`, replace `bun.lock` with:

```yaml
- pnpm-lock.yaml
- pnpm-workspace.yaml
```

Use these commands for the CI steps:

```yaml
- name: Format check
  run: pnpm format:check

- name: Lint all workspaces
  run: pnpm lint:all

- name: Typecheck all workspaces
  run: pnpm typecheck:all

- name: Typecheck
  run: pnpm --filter '@omnicraft/backend' typecheck

- name: Test
  run: pnpm --filter '@omnicraft/backend' test

- name: Typecheck & Build
  run: pnpm --filter '@omnicraft/frontend' build

- name: Test
  run: pnpm --filter '@omnicraft/frontend' test
```

- [ ] **Step 4: Convert AI-review workflow execution**

In `.github/workflows/ai-review.yml`, make these replacements:

```yaml
run: node scripts/src/ai-review/check-config.ts
run: node scripts/src/ai-review/resolve-range.ts
run: pnpm install --frozen-lockfile
run: node scripts/src/ai-review/read-verdict.ts
run: node scripts/src/ai-review/gate.ts
```

Keep each replacement in the existing step and preserve all existing IDs, working directories, and environment variables.

- [ ] **Step 5: Convert the review-pass PR-head install**

In `.github/actions/run-review-pass/action.yml`, replace the dependency install command with:

```yaml
run: pnpm install --frozen-lockfile
```

- [ ] **Step 6: Verify GitHub automation no longer requires Bun**

Run the Step 1 `rg` command again.

Expected: no matches and exit code 1 from `rg`.

- [ ] **Step 7: Validate workflow formatting**

Run:

```bash
pnpm exec prettier --check .github
```

Expected: all GitHub YAML files pass Prettier.

- [ ] **Step 8: Commit automation changes**

```bash
git add .github
git commit -m "ci: migrate automation to Node and PNPM"
```

### Task 5: Run migration acceptance checks

**Files:**

- Verify: all files changed in Tasks 1-4
- Modify only if a verification command exposes a migration defect.

- [ ] **Step 1: Verify a frozen dependency installation**

Run:

```bash
pnpm install --frozen-lockfile
```

Expected: PASS without modifying `pnpm-lock.yaml`.

- [ ] **Step 2: Run repository static checks**

Run:

```bash
pnpm format:check
pnpm lint:all
pnpm typecheck:all
```

Expected: all three commands pass.

- [ ] **Step 3: Run application tests and frontend build**

Run:

```bash
pnpm --filter '@omnicraft/backend' test
pnpm --filter '@omnicraft/frontend' test
pnpm --filter '@omnicraft/frontend' build
```

Expected: backend tests, frontend tests, TypeScript build, and Vite production build all pass.

- [ ] **Step 4: Smoke-test backend startup under Node.js**

Run:

```bash
PORT=3000 VSCODE_PORT=18927 pnpm --filter '@omnicraft/backend' start
```

Expected: Node.js loads the TypeScript entry point, workspace packages, `.js`-to-`.ts` imports, and `@/` aliases without a module-resolution or Bun-runtime error. Stop the process with Ctrl-C after the backend begins listening or reaches an external `code serve-web` prerequisite.

- [ ] **Step 5: Confirm the operational Bun scan and lockfile state**

Run:

```bash
rg -n '\b[Bb]un\b|bunx|bun\.lock|setup-bun|Bun\.' package.json apps/backend/package.json pnpm-workspace.yaml .github .husky CLAUDE.md apps/backend/CLAUDE.md .claude/skills/dev-server/SKILL.md .gitignore apps/backend/src/agent-core/llm-session/sanitize-reminder.ts
test ! -e bun.lock
test -e pnpm-lock.yaml
```

Expected: `rg` returns no matches; the Bun lockfile is absent and the PNPM lockfile exists. Historical documents and inert frontend fixtures are intentionally outside this scan.

- [ ] **Step 6: Check the final patch**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors and only intentional migration changes, if any verification fixes remain uncommitted.

- [ ] **Step 7: Commit verification fixes if needed**

If Steps 1-6 required a migration correction, commit only those corrections:

```bash
git add -u
git commit -m "fix: complete Node and PNPM migration"
```

If verification required no corrections, do not create an empty commit.
