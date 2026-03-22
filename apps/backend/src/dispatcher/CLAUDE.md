# Dispatcher

HTTP route handlers. Each module under `dispatcher/` corresponds to a resource.

## Structure

Each dispatcher module follows this structure:

```
<resource>/
├── index.ts        # Exports the router
├── path.ts         # Route path constants
├── router.ts       # Route handlers — call service layer
└── validator.ts    # Zod schemas and helpers for request validation
```

## Conventions

- Every dispatcher module must have a `validator.ts` that defines Zod schemas for request bodies and helpers for parsing/validating path parameters.
- Router handlers must not contain inline validation logic. All input validation goes through the validator.
- Router handlers catch `ZodError` and return 400 with `e.issues`. Unknown errors are re-thrown.
