# Settings Schema

Shared Zod schemas for OmniCraft settings. Used by both frontend and backend.

## Design

- Schemas are the single source of truth for settings structure.
- Each schema section maps to a subdirectory (e.g., `llm/` for LLM settings).
- Nesting stops at leaf values. Leaf values are scalars or arrays — they cannot be navigated further via key paths.
- The root `settingsSchema` and `Settings` type are always exported. Sub-schemas and types may also be exported from `index.ts` when they serve as shared types across packages (e.g., `AllowedPathEntry`).
- Every leaf field has a `.describe()` for runtime introspection and a `.default()` for fallback values.
- The schema must be convertible to JSON Schema via `z.toJSONSchema()`. Only use Zod types that support this (no `z.function()`, `z.transform()`, etc.). A test enforces this.

## Adding a New Section

1. Create a new directory under `src/` (e.g., `src/general/`).
2. Define the schema in `schema.ts` inside that directory.
3. Import and compose it into `src/schema.ts`.
