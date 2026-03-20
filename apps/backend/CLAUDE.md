## OmniCraft Backend

- Runtime: Bun
- Framework: Koa + @koa/router
- Logger: Pino (with koa-pino-logger middleware; use `ctx.log` in requests, `logger` from `@/logger.js` elsewhere)
- Config: `.env` (Bun auto-loads; see `.env.example` for available variables)

## Project Structure

```
src/
├── index.ts        # App entry point
├── dispatcher/     # HTTP route handlers — call service layer
├── services/       # Business logic — call API layer
├── api/            # External service communication
├── models/         # Data models
├── middleware/     # Koa middleware
├── types/          # Shared types
├── logger.ts       # Pino logger instance
```

Layers only depend on downward: Dispatcher → Service → Model/API. Never reverse.

## Conventions

- No default exports (config files exempted)
- Group related functions using object literals as namespaces (e.g. `export const aliyunOss = { uploadFile, deleteFile }`)
- File names use kebab-case (e.g. `error-handler.ts`)
- Import order enforced
- Relative imports use `.js` extension (nodenext resolution)
- Use `@/*` alias for `src/` when importing across modules. In-module imports use relative paths.
- No `console` usage. Use `ctx.log` in request context, or import `logger` from `@/logger.js` outside of requests.
- Use `assert` from `node:assert` for runtime invariants (e.g. required env vars). No non-null assertions (`!`) — use `assert` to narrow instead.
- Commit messages follow Conventional Commits (`feat:`, `fix:`, `chore:`, etc.)
- Update all relevant CLAUDE.md files when conventions or patterns change. Do not repeat global conventions in subdirectory CLAUDE.md files.
- Run lint, format check, and test when major changes are done

## Commands

Check package.json.
