# Node.js and PNPM Migration Design

## Goal

Replace Bun as OmniCraft's runtime and package manager with Node.js 24 or newer
and PNPM 11.12.0 or a compatible PNPM 11 release, while preserving the existing TypeScript source-first
development workflow and application behavior.

## Version Policy

- Declare `engines.node` as `>=24` in the root package manifest.
- Declare `devEngines.packageManager` with PNPM version `^11.12.0` and
  `onFail: "error"`. PNPM 11 supports version ranges through this field; it
  resolves the range to an exact package-manager version stored in
  `pnpm-lock.yaml` under `packageManagerDependencies` and reuses that version
  while it satisfies the range. A missing or incompatible PNPM installation is
  an explicit setup error; the repository does not automatically download a
  different package-manager executable.
- Run CI on Node.js 24 so the minimum supported major is continuously tested.

## Workspace and Dependency Management

Create `pnpm-workspace.yaml` containing the current workspace globs for apps,
packages, shared configs, and repository scripts. Move the shared dependency
catalog from the root `package.json` into PNPM's `catalog` configuration in that
file. Remove the root `workspaces` and `catalog` fields because PNPM reads both
concerns from `pnpm-workspace.yaml`.

Remove `@types/bun`; runtime source already follows the repository convention of
using Node.js APIs. Add `tsx` as a catalogued development dependency where
TypeScript entry points are executed. Generate and commit `pnpm-lock.yaml`, and
delete `bun.lock`.

## Runtime Commands

Use the locally installed `tsx` development dependency to launch TypeScript
entry points on Node.js:

- Backend development runs `tsx watch`.
- Backend production start runs `tsx` without watch mode.
- Both backend commands use Node's `--env-file-if-exists=.env`, retaining Bun's
  previous optional `.env` loading behavior.
- Root package scripts invoke the local `tsx` binary directly. GitHub workflow
  steps outside package scripts use `pnpm exec tsx`.

The `tsx` launcher is required because the backend currently uses TypeScript path
aliases and `.js` import specifiers that resolve to `.ts` sources during
development. Node's native type stripping does not implement the TypeScript
path mapping needed by this codebase. The executing runtime remains Node.js;
`tsx` only supplies TypeScript transformation and resolution.

Convert workspace script orchestration to PNPM commands. The root development
command continues to allocate distinct ports first, then starts both app
workspaces in parallel. Package-specific build, start, test, lint, and typecheck
commands use PNPM filters.

## Git Hooks and Automation

Change Husky hooks to invoke local binaries with `pnpm exec`.

Replace the shared GitHub setup action with this sequence:

1. Bootstrap PNPM 11.12.0, which satisfies the repository's declared PNPM
   range.
2. Install Node.js 24 and enable PNPM store caching through `actions/setup-node`.
3. Run `pnpm install --frozen-lockfile`.

Update CI path filters from `bun.lock` to `pnpm-lock.yaml` and replace all Bun
commands in CI and AI-review workflows. Nested PR-head installations in the
AI-review workflow and composite action also use the frozen PNPM lockfile.

## Documentation Scope

Update live operational guidance:

- Root `CLAUDE.md` describes a Node.js and PNPM monorepo, PNPM dependency
  commands, and the rule against runtime-specific non-Node APIs.
- Backend `CLAUDE.md` documents Node.js and Node's optional `.env` loading.
- `.claude/skills/dev-server/SKILL.md` uses the new root development command and
  describes PNPM workspace orchestration.
- `.gitignore` describes `node_modules` without referring to Bun.

Do not rewrite historical plans and specifications: they describe the toolchain
that existed when those changes were designed. Do not alter UI showcase data or
tests where Bun commands are inert example content rather than repository
operations. Update the source comment that names `Bun.escapeHTML` so the active
codebase no longer presents Bun as a project convention.

## Verification

The migration is complete when all of the following succeed without Bun:

1. A clean `pnpm install --frozen-lockfile`.
2. `pnpm format:check`.
3. `pnpm lint:all`.
4. `pnpm typecheck:all`.
5. Backend and frontend test suites through PNPM filters.
6. The frontend production build.
7. A backend startup smoke test proving Node can load the TypeScript entry point,
   workspace packages, and backend path aliases. The process may stop after it
   reaches application configuration or begins listening.
8. A focused search confirms there are no Bun references in operational package
   scripts, hooks, active contributor guidance, GitHub automation, lockfiles, or
   runtime comments.

Historical documentation and inert UI fixtures are explicitly excluded from the
final Bun-reference scan.
