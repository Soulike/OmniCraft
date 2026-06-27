# Dispatcher

HTTP route handlers. Each module under `dispatcher/` corresponds to a resource.

## Structure

Each dispatcher module follows this structure:

```
<resource>/
├── index.ts        # Exports the router
├── path.ts         # Route path constants
├── router.ts       # Route handlers — call service layer
└── validator.ts    # (optional) Helpers for request validation (e.g. path parsing)
```

## Conventions

- Request/response Zod schemas live in `@omnicraft/api-schema`. Routers import them directly from the package.
- A `validator.ts` is only needed when a dispatcher has backend-specific validation helpers (e.g. `parseLeafKeyPath`). Pure re-export files should not exist.
- Router handlers must not contain inline validation logic. All input validation goes through schemas or validator helpers.
- Router handlers catch `ZodError` and return 400 with `e.issues`. Unknown errors are re-thrown.
- Agent-agnostic transport helpers shared across resource modules live in
  `dispatcher/helpers/` (e.g. SSE cursor parsing and event pumping), not inside
  any single resource folder.
