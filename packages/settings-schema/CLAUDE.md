# Settings Schema

Shared Zod schemas for OmniCraft settings. Used by both frontend and backend.

## Design

- Schemas are the single source of truth for settings structure.
- Each schema section maps to a subdirectory (e.g., `llm/` for LLM settings).
- Nesting stops at scalar values (leaf nodes).
- Only `settingsSchema` (the root) is exported. Sub-schemas are accessed via `.shape` (e.g., `settingsSchema.shape.llm`).
- Every leaf field has a `.describe()` for runtime introspection and a `.default()` for fallback values.

## Adding a New Section

1. Create a new directory under `src/` (e.g., `src/general/`).
2. Define the schema in `schema.ts` inside that directory.
3. Import and compose it into `src/schema.ts`.
