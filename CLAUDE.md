# Development Instructions

This is a Node.js monorepo managed with PNPM.

## Task Preparation

Before starting any task, you must first confirm:

- What package manager is used. Use correct package manager to run commands.
- Configurations in package.json files, both in project and in workspace.
- Configurations for other tools, i.e., Vite, Vitest, ESLint, Prettier, etc.

## Dependencies

- When adding a new npm package, always install it via the package manager (e.g., `pnpm add <package>`). Never manually write a version number in package.json.
- Never re-export a **workspace package's** (`@omnicraft/*`) exports from a local module (e.g., `export ... from '@omnicraft/foo'`); import the package directly wherever it's needed. (This applies to workspace-package exports only — a module's own `index.ts` re-exporting its **internal** files as a facade is fine.)

## Verification

- After a pre-commit hook runs, do not repeat compilation or test verification solely because the hook formatted files or ran lint. Formatting and lint do not affect compilation or test results.

## Runtime APIs

- Node.js is the runtime. Use Node.js APIs (for example,
  `node:fs/promises` and `node:path`) and do not introduce APIs tied to an
  alternative JavaScript runtime.

---

## Projects

- `apps/` - Frontend and backend.
- `configs/` - Shared configuration packages (ESLint, TypeScript, etc.).
- `packages/` - Reusable, business-agnostic packages.

---

## Code Style

### Overall

Follow Google TypeScript guide unless specified. Detail: <https://google.github.io/styleguide/tsguide.html>.

- Never use `any`. Use `unknown` and narrow with type guards or assertions.

### Comments

- Add comments when code cannot explain itself.
- Consider making the code more self-descriptive when you want to add comments.

### File Naming

- A common folder/file: **dash-case**.
- Unit test for a file: **<file-name>.test.ts**.
- A folder containing a page component: **dash-case**.
- A folder containing a special page component: **\_dash-case**, e.g., `_layout`.
- A file/folder containing a React component: **UpperCamelCase**.
- A file containing a React hook: **camelCase**, and start with `use`, e.g., `useHello.ts`.
- A file/folder containing a Web Component: **dash-case**.

### Flow Control

- Always use early-return style for `if` to reduce levels.
