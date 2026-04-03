# Web Search Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `web_search` tool powered by Tavily to the `WebToolSet`, with the API key managed through the settings system and frontend UI.

**Architecture:** New `search` section in settings schema → frontend Search settings tab → backend tool reads key via SettingsManager at execution time → calls Tavily SDK → formats results for LLM.

**Tech Stack:** `@tavily/core`, Zod, React (HeroUI), Vitest

**Spec:** `docs/superpowers/specs/2026-04-03-web-search-tool-design.md`

---

## File Structure

### New Files

| File                                                                       | Responsibility                             |
| -------------------------------------------------------------------------- | ------------------------------------------ |
| `packages/settings-schema/src/search/schema.ts`                            | Search settings Zod schema (tavilyApiKey)  |
| `apps/backend/src/agent/tool-sets/web/web-search.ts`                       | `web_search` tool definition and execution |
| `apps/backend/src/agent/tool-sets/web/web-search.test.ts`                  | web_search tool tests                      |
| `apps/frontend/src/pages/settings/sections/search/SearchSection.tsx`       | Search settings container                  |
| `apps/frontend/src/pages/settings/sections/search/SearchSectionFields.tsx` | Search settings form fields                |
| `apps/frontend/src/pages/settings/sections/search/index.ts`                | Barrel export                              |

### Modified Files

| File                                                   | Change                                |
| ------------------------------------------------------ | ------------------------------------- |
| `packages/settings-schema/src/schema.ts`               | Add search section to root schema     |
| `apps/backend/package.json`                            | Add `@tavily/core` dependency         |
| `apps/backend/src/agent/tool-sets/web/web-tool-set.ts` | Register webSearchTool                |
| `apps/backend/src/agent/tool-sets/web/index.ts`        | Export webSearchTool                  |
| `apps/frontend/src/routes.ts`                          | Add `search: {}` to settings routes   |
| `apps/frontend/src/router/lazy-pages.tsx`              | Add lazy SearchSection import         |
| `apps/frontend/src/router/router.tsx`                  | Add search route to settings children |
| `apps/frontend/src/pages/settings/SettingsPage.tsx`    | Add Search tab                        |

---

### Task 1: Install Dependency

**Files:**

- Modify: `apps/backend/package.json`

- [ ] **Step 1: Install the Tavily SDK**

```bash
cd apps/backend && bun add @tavily/core
```

- [ ] **Step 2: Verify installation**

```bash
cd apps/backend && bun run typecheck
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/package.json bun.lock
git commit -m "chore(backend): add @tavily/core dependency"
```

---

### Task 2: Add Search Settings Schema

**Files:**

- Create: `packages/settings-schema/src/search/schema.ts`
- Modify: `packages/settings-schema/src/schema.ts`

- [ ] **Step 1: Create the search settings schema**

Create `packages/settings-schema/src/search/schema.ts`:

```ts
import {z} from 'zod';

export const searchSettingsSchema = z.object({
  tavilyApiKey: z
    .string()
    .describe('API key for Tavily search service')
    .default(''),
});
```

- [ ] **Step 2: Register in root schema**

In `packages/settings-schema/src/schema.ts`, add the import and search section:

```ts
import {z} from 'zod';

import {agentSettingsSchema} from './agent/schema.js';
import {llmSettingsSchema} from './llm/schema.js';
import {searchSettingsSchema} from './search/schema.js';

export const settingsSchema = z.object({
  llm: llmSettingsSchema.prefault({}),
  agent: agentSettingsSchema.prefault({}),
  search: searchSettingsSchema.prefault({}),
});

export type Settings = z.infer<typeof settingsSchema>;
```

- [ ] **Step 3: Verify existing schema test still passes**

```bash
cd packages/settings-schema && bun run test
```

Expected: All pass (the JSON Schema conversion test should work with the new section).

- [ ] **Step 4: Verify backend typecheck**

```bash
cd apps/backend && bun run typecheck
```

Expected: No errors. The `Settings` type is used in the backend and should now include `search.tavilyApiKey`.

- [ ] **Step 5: Commit**

```bash
git add packages/settings-schema/src/search/schema.ts packages/settings-schema/src/schema.ts
git commit -m "feat(settings): add search settings schema with tavilyApiKey"
```

---

### Task 3: Add Frontend Search Settings Page

**Files:**

- Create: `apps/frontend/src/pages/settings/sections/search/SearchSectionFields.tsx`
- Create: `apps/frontend/src/pages/settings/sections/search/SearchSection.tsx`
- Create: `apps/frontend/src/pages/settings/sections/search/index.ts`
- Modify: `apps/frontend/src/routes.ts`
- Modify: `apps/frontend/src/router/lazy-pages.tsx`
- Modify: `apps/frontend/src/router/router.tsx`
- Modify: `apps/frontend/src/pages/settings/SettingsPage.tsx`

- [ ] **Step 1: Create SearchSectionFields**

Create `apps/frontend/src/pages/settings/sections/search/SearchSectionFields.tsx`:

```tsx
import {Description, FieldError, Input, Label, TextField} from '@heroui/react';

import type {SettingSectionRenderProps} from '../../components/SettingSection/index.js';

export function SearchSectionFields({
  values,
  setValue,
  validationErrors,
  isDisabled,
}: SettingSectionRenderProps) {
  return (
    <TextField
      value={String(values['search/tavilyApiKey'])}
      isInvalid={'search/tavilyApiKey' in validationErrors}
      isDisabled={isDisabled}
      onChange={(val) => {
        setValue('search/tavilyApiKey', val);
      }}
      type='password'
    >
      <Label>Tavily API Key</Label>
      <Input placeholder='tvly-...' />
      <Description>
        API key for Tavily search service. Get one at tavily.com.
      </Description>
      {validationErrors['search/tavilyApiKey'] && (
        <FieldError>{validationErrors['search/tavilyApiKey']}</FieldError>
      )}
    </TextField>
  );
}
```

- [ ] **Step 2: Create SearchSection**

Create `apps/frontend/src/pages/settings/sections/search/SearchSection.tsx`:

```tsx
import {settingsSchema} from '@omnicraft/settings-schema';

import {SettingSection} from '../../components/SettingSection/index.js';
import {SearchSectionFields} from './SearchSectionFields.js';

const searchShape = settingsSchema.shape.search.unwrap().shape;

const FIELDS = [
  {path: 'search/tavilyApiKey', schema: searchShape.tavilyApiKey},
];

export function SearchSection() {
  return (
    <SettingSection title='Search' fields={FIELDS}>
      {(props) => <SearchSectionFields {...props} />}
    </SettingSection>
  );
}
```

- [ ] **Step 3: Create barrel export**

Create `apps/frontend/src/pages/settings/sections/search/index.ts`:

```ts
export {SearchSection} from './SearchSection.js';
```

- [ ] **Step 4: Add search route**

In `apps/frontend/src/routes.ts`:

```ts
import {defineRoutes} from '@/router/define-routes/index.js';

export const ROUTES = defineRoutes({
  dashboard: {},
  chat: {},
  tasks: {},
  settings: {llm: {}, agent: {}, search: {}},
});
```

- [ ] **Step 5: Add lazy import**

In `apps/frontend/src/router/lazy-pages.tsx`, add at the end:

```tsx
export const SearchSection = lazy(async () => {
  const {SearchSection} =
    await import('@/pages/settings/sections/search/index.js');
  return {default: SearchSection};
});
```

- [ ] **Step 6: Add route to router**

In `apps/frontend/src/router/router.tsx`, add `SearchSection` to the import:

```tsx
import {
  AgentSection,
  ChatPage,
  LlmSection,
  SearchSection,
  SettingsPage,
} from './lazy-pages.js';
```

Add the route inside the settings children array, after the agent route:

```tsx
          {
            path: ROUTES.settings.search(),
            element: <SearchSection />,
          },
```

- [ ] **Step 7: Add Search tab to SettingsPage**

In `apps/frontend/src/pages/settings/SettingsPage.tsx`:

```tsx
const TABS: SettingsTab[] = [
  {id: 'llm', label: 'LLM'},
  {id: 'agent', label: 'Agent'},
  {id: 'search', label: 'Search'},
];

const TAB_TO_PATH: Record<string, string> = {
  llm: ROUTES.settings.llm(),
  agent: ROUTES.settings.agent(),
  search: ROUTES.settings.search(),
};
```

- [ ] **Step 8: Verify frontend typecheck**

```bash
cd apps/frontend && bun run typecheck
```

Expected: No errors.

- [ ] **Step 9: Commit**

```bash
git add apps/frontend/src/pages/settings/sections/search/ apps/frontend/src/routes.ts apps/frontend/src/router/lazy-pages.tsx apps/frontend/src/router/router.tsx apps/frontend/src/pages/settings/SettingsPage.tsx
git commit -m "feat(frontend): add Search settings page with Tavily API key field"
```

---

### Task 4: Create `web_search` Tool

**Files:**

- Create: `apps/backend/src/agent/tool-sets/web/web-search.ts`
- Create: `apps/backend/src/agent/tool-sets/web/web-search.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/backend/src/agent/tool-sets/web/web-search.test.ts`:

```ts
import {describe, expect, it} from 'vitest';

import {createMockContext} from '@/agent-core/tool/testing.js';

import {webSearchTool} from './web-search.js';

describe('webSearchTool', () => {
  it('has the correct name', () => {
    expect(webSearchTool.name).toBe('web_search');
  });

  it('returns error when API key is not configured', async () => {
    const result = await webSearchTool.execute(
      {query: 'test query'},
      createMockContext(),
    );
    expect(result).toContain('Error:');
    expect(result).toContain('Tavily API key is not configured');
  });
});
```

Note: We cannot test actual Tavily API calls without a real key, so we test the no-key error path and tool metadata. Integration testing with a real key is manual.

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/backend && bun run test -- src/agent/tool-sets/web/web-search.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the tool**

Create `apps/backend/src/agent/tool-sets/web/web-search.ts`:

```ts
import {tavily, type TavilySearchResponse} from '@tavily/core';
import {z} from 'zod';

import type {
  ToolDefinition,
  ToolExecutionContext,
} from '@/agent-core/tool/index.js';
import {SettingsManager} from '@/models/settings-manager/index.js';

const parameters = z.object({
  query: z.string().describe('Search keywords.'),
  maxResults: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe('Number of results to return. Defaults to 5.'),
  includeDomains: z
    .array(z.string())
    .optional()
    .describe('Only search these domains.'),
  excludeDomains: z
    .array(z.string())
    .optional()
    .describe('Exclude these domains from results.'),
});

type WebSearchArgs = z.infer<typeof parameters>;

/** Formats a single search result for LLM consumption. */
function formatResult(
  index: number,
  result: TavilySearchResponse['results'][number],
): string {
  return [
    `[${(index + 1).toString()}] ${result.title}`,
    `URL: ${result.url}`,
    `Score: ${result.score.toString()}`,
    result.content,
  ].join('\n');
}

/** Tool that searches the web via Tavily. */
export const webSearchTool: ToolDefinition<typeof parameters> = {
  name: 'web_search',
  displayName: 'Web Search',
  description:
    'Searches the web and returns relevant results with titles, URLs, and content summaries.',
  parameters,
  async execute(
    args: WebSearchArgs,
    _context: ToolExecutionContext,
  ): Promise<string> {
    // 1. Read API key from settings
    const settings = await SettingsManager.getInstance().getAll();
    const apiKey = settings.search.tavilyApiKey;

    if (!apiKey) {
      return 'Error: Tavily API key is not configured. Set it in Settings > Search.';
    }

    // 2. Call Tavily
    let response: TavilySearchResponse;
    try {
      const client = tavily({apiKey});
      response = await client.search(args.query, {
        maxResults: args.maxResults ?? 5,
        includeDomains: args.includeDomains,
        excludeDomains: args.excludeDomains,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return `Error: Search failed: ${message}`;
    }

    // 3. Format response
    if (response.results.length === 0) {
      return `No results found for "${args.query}"`;
    }

    const header = `Found ${response.results.length.toString()} results for "${args.query}":`;
    const formatted = response.results
      .map((r, i) => formatResult(i, r))
      .join('\n\n');
    return `${header}\n\n${formatted}`;
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/backend && bun run test -- src/agent/tool-sets/web/web-search.test.ts
```

Expected: All pass.

- [ ] **Step 5: Run typecheck**

```bash
cd apps/backend && bun run typecheck
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/agent/tool-sets/web/web-search.ts apps/backend/src/agent/tool-sets/web/web-search.test.ts
git commit -m "feat(backend): add web_search tool powered by Tavily"
```

---

### Task 5: Register Tool and Update Exports

**Files:**

- Modify: `apps/backend/src/agent/tool-sets/web/web-tool-set.ts`
- Modify: `apps/backend/src/agent/tool-sets/web/index.ts`

- [ ] **Step 1: Register in WebToolSet**

Replace `apps/backend/src/agent/tool-sets/web/web-tool-set.ts`:

```ts
import {ToolSetDefinition} from '@/agent-core/tool-set/index.js';

import {webFetchTool} from './web-fetch.js';
import {webFetchRawTool} from './web-fetch-raw.js';
import {webSearchTool} from './web-search.js';

/** Tool set for web-related operations: fetching URLs, searching, etc. */
export class WebToolSet extends ToolSetDefinition {
  constructor() {
    super({
      name: 'web',
      description:
        'Tools for retrieving information from the web, including fetching URL contents and web search.',
    });
    this.register(webFetchTool);
    this.register(webFetchRawTool);
    this.register(webSearchTool);
  }
}
```

- [ ] **Step 2: Update barrel exports**

In `apps/backend/src/agent/tool-sets/web/index.ts`, add:

```ts
export {webSearchTool} from './web-search.js';
```

- [ ] **Step 3: Run full typecheck and test suite**

```bash
cd apps/backend && bun run typecheck && bun run test
```

Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/agent/tool-sets/web/web-tool-set.ts apps/backend/src/agent/tool-sets/web/index.ts
git commit -m "feat(backend): register web_search in WebToolSet"
```

---

### Task 6: Final Verification

- [ ] **Step 1: Run backend typecheck and tests**

```bash
cd apps/backend && bun run typecheck && bun run test
```

Expected: All pass.

- [ ] **Step 2: Run settings-schema tests**

```bash
cd packages/settings-schema && bun run test
```

Expected: All pass.

- [ ] **Step 3: Run frontend typecheck**

```bash
cd apps/frontend && bun run typecheck
```

Expected: No errors.

- [ ] **Step 4: Fix any issues found, then commit fixes if needed**
