# Settings Schema

Shared Zod schemas for OmniCraft settings. Used by both frontend and backend.

## Design

- Schemas are the single source of truth for settings structure.
- Each schema section maps to a subdirectory (e.g., `llm/` for LLM settings).
- Nesting stops at scalar values (leaf nodes).
- Only `settingsSchema` (the root) is exported. Sub-schemas are accessed via `.shape`, but since sections are wrapped with `.prefault()`, you must call `.unwrap()` first to access nested shapes (e.g., `settingsSchema.shape.llm.unwrap().shape`).
- Every leaf field has a `.describe()` for runtime introspection and a `.default()` for fallback values.
- The schema must be convertible to JSON Schema via `z.toJSONSchema()`. Only use Zod types that support this (no `z.function()`, `z.transform()`, etc.). A test enforces this.

## Adding a New Section

1. Create a new directory under `src/` (e.g., `src/general/`).
2. Define the schema in `schema.ts` inside that directory.
3. Import and compose it into `src/schema.ts`.
