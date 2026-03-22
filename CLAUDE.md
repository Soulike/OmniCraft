# Development Instructions

This is a Bun monorepo containing multiple types of projects.

## Bun Doc

Since Bun is new, you may not know its latest functionalities. You can refer
to [latest Bun doc](https://bun.com/docs/llms.txt) if you need information.

## Task Preparation

Before starting any task, you must first confirm:

- What package manager is used. Use correct package manager to run commands.
- Configurations in package.json files, both in project and in workspace.
- Configurations for other tools, i.e., Vite, Vitest, ESLint, Prettier, etc.

## Dependencies

- When adding a new npm package, always install it via the package manager (e.g., `bun add <package>`). Never manually write a version number in package.json.

## Runtime APIs

- Bun is used only as the package manager and runtime. In code, always use Node.js APIs (e.g., `node:fs/promises`, `node:path`). Do not use Bun-specific APIs (e.g., `Bun.file()`, `Bun.write()`).

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
