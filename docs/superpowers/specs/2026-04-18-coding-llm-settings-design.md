# Separate LLM Settings for Coding Agent

## Problem

Chat and Coding backends are already separated (different agent classes, session stores, routes), but they share the same LLM settings (`settings.llm`). Users cannot configure different models/providers for Chat vs Coding.

## Decision

Add a new `codingLlm` top-level section to settings, reusing the existing `llmSettingsSchema`. Keep existing `llm` for Chat (backward-compatible).

## Changes

### 1. Settings Schema (`packages/settings-schema`)

Add `codingLlm` field in `src/schema.ts`, reusing `llmSettingsSchema`:

```typescript
export const settingsSchema = z.object({
  llm: llmSettingsSchema.prefault({}),
  codingLlm: llmSettingsSchema.prefault({}), // NEW
  agent: agentSettingsSchema.prefault({}),
  search: searchSettingsSchema.prefault({}),
  fileAccess: fileAccessSettingsSchema.prefault({}),
});
```

Both share the same defaults (apiFormat: claude, baseUrl: anthropic, model: claude-sonnet-4).

### 2. Backend (`apps/backend`)

Only `CodingAgent` changes — read from `settings.codingLlm` instead of `settings.llm`:

- `coding-agent.ts`: `getConfig` and `getLightConfig` callbacks read `settings.codingLlm`
- `MainAgent` unchanged — continues reading `settings.llm`
- Settings service/manager unchanged — path-based CRUD automatically supports new paths

### 3. Frontend (`apps/frontend`)

- New `coding-llm/` section under `pages/settings/sections/` with `CodingLlmSection` and `CodingLlmSectionFields`
- Rename "LLM" tab to "Chat LLM", add "Coding LLM" tab
- New route `settings.codingLlm` and lazy-loaded component
- Tab order: Chat LLM | Coding LLM | Agent | Search | File Access

## Files Changed

1. `packages/settings-schema/src/schema.ts` — add `codingLlm` field
2. `apps/backend/src/agent/agents/coding-agent/coding-agent.ts` — read `codingLlm`
3. `apps/frontend/src/pages/settings/sections/coding-llm/CodingLlmSection.tsx` — new
4. `apps/frontend/src/pages/settings/sections/coding-llm/CodingLlmSectionFields.tsx` — new
5. `apps/frontend/src/pages/settings/sections/coding-llm/index.ts` — new
6. `apps/frontend/src/routes.ts` — add `codingLlm` route
7. `apps/frontend/src/pages/settings/SettingsPage.tsx` — rename tab, add tab
8. `apps/frontend/src/router/router.tsx` — add route
9. `apps/frontend/src/router/lazy-pages.tsx` — add lazy import
