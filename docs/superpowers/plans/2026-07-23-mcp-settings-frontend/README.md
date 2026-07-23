# MCP Settings Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Tasks live in the `part-*.md` files listed below — implement them in order.

**Goal:** Build the MCP settings UX (issue #362): a single **MCP → Servers** page to add/edit/remove MCP servers, toggle per-agent (Chat/Coding) enablement, and observe live connection status with reconnect.

**Architecture:** A new settings section (`pages/settings/sections/mcp/servers/`) following the existing Workspaces-section MVVM split (container composes focused hooks → stateless view). Config is read/written through the existing `/settings` leaf endpoints (`mcp/servers`, `mcp/enabledByAgent/chat`, `mcp/enabledByAgent/coding`); live status comes from `GET /api/mcp/servers`. The two sources are merged by server name into view rows. Immediate per-action saves (no page-level Save button). Backend touch is a one-line api-schema enum trim.

**Tech Stack:** React 19 + Vite, TypeScript (nodenext, `.js` import suffix), HeroUI v3 (beta), CSS Modules, Vitest + @testing-library/react, Zod (`@omnicraft/settings-schema`, `@omnicraft/api-schema`), PNPM workspace.

**Design spec:** `docs/superpowers/specs/2026-07-23-mcp-settings-frontend-design.md`

## Global Constraints

- **Package manager:** PNPM. Run tests per package:
  - `pnpm --filter @omnicraft/api-schema test`
  - `pnpm --filter @omnicraft/settings-schema test`
  - `pnpm --filter @omnicraft/frontend test`
  - A single Vitest file: `pnpm --filter @omnicraft/frontend test -- <path>` (append the test file path).
- **No `any`.** Use `unknown` + narrowing/`safeParse`.
- **No default exports.** Page-component `index.ts` uses a plain named export (`export {McpServersSection} from './McpServersSection.js';`); non-page components re-export the container from `index.ts`.
- **Imports:** relative imports carry the `.js` extension; cross-module imports use the `@/` alias. Only import a component through its folder `index.ts`, never an internal file.
- **Styling:** CSS Modules only. Consume HeroUI tokens (`var(--surface)`, `var(--border)`, `var(--foreground)`, `var(--accent-soft)`, …). No Tailwind utility classes in our components. No redefining HeroUI tokens, no `:global(...)` into HeroUI internals.
- **Component files:** at most one React component per file. MVVM: container (`X.tsx`) holds no state, only composes hooks and passes to `XView.tsx`; state lives in hooks (`hooks/useX.ts`), one concern each. Non-hook helpers go in a `helpers/` subfolder.
- **File naming:** dash-case folders/files; React component files UpperCamelCase; hook files camelCase starting `use`; tests `<name>.test.ts(x)`.
- **HeroUI v3 is beta.** The compound-component prop names below are best-effort; if a prop/subcomponent name mismatches the installed `@heroui/react`, verify with the HeroUI MCP (`get_component_docs`) and adjust — the behavior contract in each task is what must hold.
- **Both themes.** Every UI change is verified in light _and_ dark (final task).
- **Commits:** Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`…). One commit per task unless a task says otherwise.

## Backend/settings facts (verified, rely on these)

- Leaf paths `mcp/servers`, `mcp/enabledByAgent/chat`, `mcp/enabledByAgent/coding` are valid settings leaves (array leaves) — whole-array PUT via `/settings/batch` works with no backend write endpoint.
- `@omnicraft/api-schema` already exports `getMcpServersResponseSchema`, `mcpServerStatusSchema`, `GetMcpServersResponse`, `McpServerStatusResponse`.
- `GET /api/mcp/servers` returns only servers enabled for ≥1 agent. `POST /api/mcp/servers/:name/reconnect` → 202 on success, 404 if unknown.
- `@omnicraft/settings-schema` exports types `McpServer`, `McpTransport`, `McpSettings`, `AgentType` and the value `mcpSettingsSchema`; it does **not** yet export the `mcpServerSchema`/`mcpTransportSchema` values (Task 1 adds them).

## Shared types (defined once, referenced across tasks)

Defined in Task 3 (`api/settings/mcp`) and Task 4 (`helpers`); listed here so every task uses identical names:

```ts
// api/settings/mcp/mcp.ts
interface McpConfig {
  servers: McpServer[];
  enabledChat: string[];
  enabledCoding: string[];
}
interface McpConfigUpdate {
  servers?: McpServer[];
  enabledChat?: string[];
  enabledCoding?: string[];
}

// helpers/merge-servers.ts
type McpDisplayStatus =
  | 'connecting'
  | 'connected'
  | 'error'
  | 'not-enabled'
  | 'unknown';
interface McpServerRow {
  name: string;
  transport: McpTransport;
  enabledChat: boolean;
  enabledCoding: boolean;
  status: McpDisplayStatus;
  tools: {name: string; description: string}[];
  error?: string;
}
```

`McpServer`/`McpTransport` are imported from `@omnicraft/settings-schema`; `McpServerStatusResponse` from `@omnicraft/api-schema`. Per-agent toggles key off `AgentType` (`AgentType.CHAT === 'chat'`, `AgentType.CODING === 'coding'`).

## Task index

| #   | Task                                                       | Part                                         |
| --- | ---------------------------------------------------------- | -------------------------------------------- |
| 1   | Schema packages: trim status enum + export server schema   | [part-1](./part-1-schemas-and-api.md)        |
| 2   | FE api `api/mcp`: status + reconnect client                | [part-1](./part-1-schemas-and-api.md)        |
| 3   | FE api `api/settings/mcp`: config-leaf accessors           | [part-1](./part-1-schemas-and-api.md)        |
| 4   | Pure helpers: `merge-servers` + `format-transport-summary` | [part-2](./part-2-helpers-and-primitives.md) |
| 5   | `StatusChip` presentational component                      | [part-2](./part-2-helpers-and-primitives.md) |
| 6   | Field editors: `KeyValueEditor` + `StringListEditor`       | [part-2](./part-2-helpers-and-primitives.md) |
| 7   | `useServerForm` hook (form state + validation)             | [part-3](./part-3-form-modal.md)             |
| 8   | `ServerFormModal` component (add/edit dialog)              | [part-3](./part-3-form-modal.md)             |
| 9   | `ServerCard` component                                     | [part-4](./part-4-card-and-list.md)          |
| 10  | `ServerList` component                                     | [part-4](./part-4-card-and-list.md)          |
| 11  | `useMcpStatus` hook (fetch + poll + reconnect)             | [part-5](./part-5-data-hooks.md)             |
| 12  | `useMcpConfig` hook (load + immediate-save mutations)      | [part-5](./part-5-data-hooks.md)             |
| 13  | `useServerFormModal` hook (modal open state)               | [part-5](./part-5-data-hooks.md)             |
| 14  | `McpServersSection` container + view                       | [part-6](./part-6-section-and-wiring.md)     |
| 15  | Routing + nav wiring                                       | [part-6](./part-6-section-and-wiring.md)     |
| 16  | Manual verification (both themes)                          | [part-7](./part-7-verification.md)           |

## File map (what each new file owns)

```
packages/api-schema/src/mcp/schema.ts            # (mod) status enum: drop 'disabled'
packages/api-schema/src/mcp/schema.test.ts       # (new) enum assertion
packages/settings-schema/src/mcp/schema.ts       # (mod) export mcpServerSchema, mcpTransportSchema
packages/settings-schema/src/index.ts            # (mod) re-export the two schemas
packages/settings-schema/src/mcp/schema.test.ts  # (mod) export-validation cases

apps/frontend/src/api/mcp/                        # status + reconnect client
  mcp.ts  index.ts  mcp.test.ts
apps/frontend/src/api/settings/mcp/              # config-leaf accessors
  mcp.ts  index.ts  mcp.test.ts

apps/frontend/src/pages/settings/sections/mcp/servers/
  index.ts                       # export {McpServersSection}
  McpServersSection.tsx          # container
  McpServersSectionView.tsx      # stateless view
  styles.module.css
  hooks/
    useMcpConfig.ts  useMcpStatus.ts  useServerFormModal.ts  (+ .test.ts each)
  helpers/
    merge-servers.ts  format-transport-summary.ts  (+ .test.ts each)
  components/
    StatusChip/         StatusChip.tsx index.ts StatusChip.test.tsx
    KeyValueEditor/     KeyValueEditor.tsx index.ts styles.module.css KeyValueEditor.test.tsx
    StringListEditor/   StringListEditor.tsx index.ts styles.module.css StringListEditor.test.tsx
    ServerList/         ServerList.tsx index.ts styles.module.css
    ServerCard/         ServerCard.tsx index.ts styles.module.css ServerCard.test.tsx
    ServerFormModal/    ServerFormModal.tsx ServerFormModalView.tsx index.ts styles.module.css
      hooks/useServerForm.ts  useServerForm.test.ts

apps/frontend/src/routes.ts                       # (mod) settings.mcp.servers
apps/frontend/src/pages/settings/SettingsPage.tsx # (mod) MCP nav group
apps/frontend/src/router/lazy-pages.tsx           # (mod) lazy McpServersSection
apps/frontend/src/router/router.tsx               # (mod) child route
apps/frontend/src/routes.test.ts                  # (mod) if it asserts the route set
```

## Execution handoff

After all tasks: see [part-7](./part-7-verification.md) for the manual verification checklist, then the branch is ready for a PR against `main`.
