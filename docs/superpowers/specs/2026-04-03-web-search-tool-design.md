# web_search Tool Design

## Overview

A `web_search` tool in the `WebToolSet` that searches the web via the Tavily
API. The Tavily API key is stored in settings (alongside LLM settings) and
managed through the frontend settings UI.

## Tool Interface

**Name:** `web_search`

### Parameters

| Parameter        | Type                              | Required | Description                             |
| ---------------- | --------------------------------- | -------- | --------------------------------------- |
| `query`          | `z.string()`                      | Yes      | Search keywords.                        |
| `maxResults`     | `z.number().int().min(1).max(20)` | No       | Number of results to return. Default 5. |
| `includeDomains` | `z.array(z.string())`             | No       | Only search these domains.              |
| `excludeDomains` | `z.array(z.string())`             | No       | Exclude these domains.                  |

### Response Format

```
Found <n> results for "<query>":

[1] <title>
URL: <url>
Score: <score>
<content>

[2] <title>
URL: <url>
Score: <score>
<content>

...
```

No results: `No results found for "<query>"`.

## Error Handling

All errors are returned as strings prefixed with `Error:` (consistent with
other tools).

| Scenario           | Response                                                                |
| ------------------ | ----------------------------------------------------------------------- |
| No API key         | `Error: Tavily API key is not configured. Set it in Settings > Search.` |
| Tavily API failure | `Error: Search failed: <reason>`                                        |

## API Key Management

### Storage

The Tavily API key is stored in the settings system, under a new `search`
section:

```ts
// packages/settings-schema/src/search/schema.ts
export const searchSettingsSchema = z.object({
  tavilyApiKey: z
    .string()
    .describe('API key for Tavily search service')
    .default(''),
});
```

Registered in the root schema:

```ts
export const settingsSchema = z.object({
  llm: llmSettingsSchema.prefault({}),
  agent: agentSettingsSchema.prefault({}),
  search: searchSettingsSchema.prefault({}),
});
```

### Reading the Key

The tool reads the key at execution time via
`SettingsManager.getInstance().getAll()`, accessing
`settings.search.tavilyApiKey`. This means changes take effect immediately
without restart.

### Frontend Settings UI

A new "Search" tab in the settings page with a single password field for the
Tavily API key. Follows the existing pattern (SettingSection + SectionFields).

## Tool Registration

`web_search` is always registered in `WebToolSet`, regardless of whether the
API key is configured. If no key is set, the tool returns an error message
guiding the user to configure it.

## New Dependency

- `@tavily/core` — Tavily search SDK (164KB)

## File Changes

### New Files

| File                                                                       | Purpose                        |
| -------------------------------------------------------------------------- | ------------------------------ |
| `packages/settings-schema/src/search/schema.ts`                            | Search settings Zod schema     |
| `apps/backend/src/agent/tool-sets/web/web-search.ts`                       | web_search tool implementation |
| `apps/backend/src/agent/tool-sets/web/web-search.test.ts`                  | web_search tool tests          |
| `apps/frontend/src/pages/settings/sections/search/SearchSection.tsx`       | Search settings container      |
| `apps/frontend/src/pages/settings/sections/search/SearchSectionFields.tsx` | Search settings form fields    |
| `apps/frontend/src/pages/settings/sections/search/index.ts`                | Barrel export                  |

### Modified Files

| File                                                   | Change                              |
| ------------------------------------------------------ | ----------------------------------- |
| `packages/settings-schema/src/schema.ts`               | Add search section to root schema   |
| `apps/backend/package.json`                            | Add `@tavily/core` dependency       |
| `apps/backend/src/agent/tool-sets/web/web-tool-set.ts` | Register webSearchTool              |
| `apps/backend/src/agent/tool-sets/web/index.ts`        | Export webSearchTool                |
| `apps/frontend/src/routes.ts`                          | Add `search: {}` to settings routes |
| `apps/frontend/src/pages/settings/SettingsPage.tsx`    | Add Search tab                      |
| `apps/frontend/src/router/`                            | Add search route definition         |
