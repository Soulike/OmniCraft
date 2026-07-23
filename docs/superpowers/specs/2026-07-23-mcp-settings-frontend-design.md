# MCP Settings Frontend (Servers editor + status panel)

## Problem

The MCP backend shipped in [#366](https://github.com/Soulike/OmniCraft/pull/366)
(design: `docs/superpowers/specs/2026-07-22-mcp-tools-support-design.md`) — the
`mcp` settings section, the `McpManager`, and the HTTP status API — but there is
**no frontend** to configure servers or observe them. Today an MCP server can
only be added by hand-editing `settings.json`. This round builds the settings UX
([#362](https://github.com/Soulike/OmniCraft/issues/362)): add / edit / remove
servers, per-agent enablement, and a live connected-servers panel.

## Scope

**In scope**

- A single **MCP → Servers** settings page: add / edit / remove servers with a
  transport picker (**stdio** `command`/`args`/`env` or **Streamable HTTP**
  `url`/`headers`).
- **Per-agent enablement** (Chat / Coding) via switches on each server, backed by
  `mcp.enabledByAgent`.
- A **connected-servers status panel** folded into the same page: per-server live
  status, discovered tools, and a reconnect button, from `GET /api/mcp/servers`.

**Out of scope** (deferred, unchanged from the backend round)

- Generic `mcp__<server>__<tool>` **chat tool-call rendering** (#362 related,
  its own later change).
- Boot-time connection-status indicator ([#361](https://github.com/Soulike/OmniCraft/issues/361)).
- Consent gating ([#360](https://github.com/Soulike/OmniCraft/issues/360)).
- MCP resources/prompts, per-conversation selection, OAuth for HTTP servers.

## Decisions

1. **One combined page.** Config editing and live status live on a single
   `MCP → Servers` page. Each server renders as one card showing its config,
   per-agent switches, live status badge, discovered tools, and actions. A
   server reads as one unit rather than being split across an "edit" screen and a
   "status" screen.
2. **No first-class "disable".** A server is `{name, transport}`; there is **no
   `enabled` flag**. Enablement is exclusively per-agent (`enabledByAgent.chat` /
   `enabledByAgent.coding`), and the connection model is per-server: `McpManager`
   connects a server iff it is enabled for ≥1 agent. "Disabled" is therefore the
   emergent state _enabled for zero agents_, which the frontend derives from
   `enabledByAgent` and renders as **"not enabled"**. See "Backend change".
3. **Add-then-toggle.** The add/edit modal captures **name + transport only**. A
   newly-added server is enabled for no agent until the user flips a switch on its
   card. Enablement lives in exactly one place (the card), not duplicated in the
   modal.
4. **Name immutable on edit.** `name` is the identity **and** the tool-namespace
   prefix (`mcp__<name>__<tool>`). Editing an existing server changes only its
   transport; the name field is read-only in edit mode. Renaming = remove +
   re-add. This avoids any reference cascade into `enabledByAgent`.
5. **Immediate per-action save.** Following the existing Workspaces section: the
   modal's Add/Save commits that server; toggling a switch and Remove each write
   immediately via `/settings/batch`, then reload config + refetch status.
   Mutating controls show a brief pending/disabled state during the write. There
   is no page-level "Save" button.
6. **Row-based field editors.** `args` is a list of single-input rows
   (add/remove); `env` and `headers` are key–value rows (add/remove). Explicit and
   unambiguous (arguments with spaces are fine), matching the app's existing
   "add row" pattern.
7. **Auto-poll status while visible.** `GET /api/mcp/servers` is refetched after
   every mutation/reconnect and polled on a ~4s interval while the page is mounted
   **and** the tab is visible (paused on `visibilitychange`, cleared on unmount),
   so background `connecting → connected/error` transitions surface without a
   manual refresh. A status-endpoint failure is **non-blocking** — the editor
   still renders and remains usable.

## Backend change — drop the dead `'disabled'` status

`McpManager`'s own connection status union is only
`connecting | connected | error`; `list()` maps exactly those and never emits
`'disabled'`. The `'disabled'` value in `mcpServerStatusSchema.status` is dead
(the only live reference in the whole MCP surface is the enum declaration
itself). Since the frontend derives "not enabled" from `enabledByAgent` (Decision
2), the status endpoint never needs to report a server that is connected to
nothing.

- `packages/api-schema/src/mcp/schema.ts`: trim the enum to
  `z.enum(['connecting', 'connected', 'error'])`.
- **No `McpManager.list()` change**, no service/dispatcher change.

`GET /api/mcp/servers` continues to return only servers enabled for ≥1 agent
(i.e. those the manager attempts to connect). Configured-but-not-enabled servers
are absent from that response and are surfaced by the frontend from the settings
config instead.

## Data flow

The page loads **two sources** and merges them by server `name`:

1. **Config** (settings — source of truth for the server list, transports, and
   enablement), via the existing `/settings` endpoints. Three array leaves,
   verified valid leaf paths (same class as `fileAccess/workspaces`):
   - `mcp/servers` → `McpServer[]`
   - `mcp/enabledByAgent/chat` → `string[]`
   - `mcp/enabledByAgent/coding` → `string[]`
2. **Status** (live connection state), via `GET /api/mcp/servers` →
   `McpServerStatusResponse[]` = `{name, transportType, status, tools, error?}`.

`helpers/merge-servers.ts` joins them into a view row per configured server:

```ts
interface McpServerRow {
  name: string;
  transport: McpTransport; // from config (full command/args/env or url/headers)
  enabledChat: boolean; // enabledByAgent.chat.includes(name)
  enabledCoding: boolean; // enabledByAgent.coding.includes(name)
  status: 'connecting' | 'connected' | 'error' | 'not-enabled';
  tools: {name: string; description: string}[];
  error?: string;
}
```

- Rows are driven by **config** order (`mcp/servers`), so the list is stable and
  editing works even if the status endpoint is unavailable.
- A configured server with a matching status entry takes that entry's
  `status`/`tools`/`error`. A configured server **absent** from the status
  response (enabled for no agent, or status endpoint unreachable) is rendered
  `not-enabled` — but only genuinely `not-enabled` when both `enabledByAgent`
  arrays exclude it. If it _is_ enabled but missing from status (endpoint down),
  the row shows an "unknown/unavailable" affordance rather than a false
  "not enabled". Merge takes both the config enablement and the status list into
  account to distinguish these.

## Components (frontend MVVM)

New section under `apps/frontend/src/pages/settings/sections/mcp/servers/`,
mirroring the Workspaces section's container/view/hooks split:

```
sections/mcp/servers/
  index.ts                       # export {McpServersSection}
  McpServersSection.tsx          # container: composes hooks, merges, wires view (no own state)
  McpServersSectionView.tsx      # stateless: loading / load-error / list + Add button + modal
  styles.module.css
  hooks/
    useMcpConfig.ts              # load config leaves; add/update/remove/setEnabled (immediate save)
    useMcpStatus.ts              # fetch GET /api/mcp/servers; poll while visible; reconnect
    useServerFormModal.ts        # modal open state + add-vs-edit target
  helpers/
    merge-servers.ts             # config + status -> McpServerRow[]  (+ merge-servers.test.ts)
  components/
    ServerList/                  # maps rows -> ServerCard; empty state
    ServerCard/                  # one server: name, StatusChip, transport summary, error Alert,
                                 #   Chat/Coding switches, tools Disclosure, Edit/Remove/Reconnect
    StatusChip/                  # status -> Chip color/variant/label + optional Spinner
    ServerFormModal/             # add/edit dialog (Modal)
      ServerFormModal.tsx
      ServerFormModalView.tsx
      styles.module.css
      hooks/useServerForm.ts     # form state, transport switching, validation
      components/
        StringListEditor/        # args: single-input rows + add/remove
        KeyValueEditor/          # env / headers: key+value rows + add/remove
```

**HeroUI v3 component mapping** (verified against the installed library):

| UI part                         | HeroUI component                                                                       |
| ------------------------------- | -------------------------------------------------------------------------------------- |
| Server row                      | `Card` (`Card.Header` / `Card.Content` / `Card.Footer`)                                |
| Status pill                     | `Chip` `variant="soft"`, color `success` / `danger` / `warning` / `default`            |
| Enable-for Chat / Coding        | `Switch` (controlled, one per agent)                                                   |
| Add / Edit / Remove / Reconnect | `Button` (`primary` / `ghost` / `danger`)                                              |
| Tools list                      | `Disclosure` + `ListBox`                                                               |
| Error reason                    | `Alert status="danger"`                                                                |
| Add/Edit dialog                 | `Modal` (same parts as `NewSessionModal`)                                              |
| Transport picker                | `ToggleButtonGroup` (single-select segmented: stdio / Streamable HTTP)                 |
| Form fields                     | `TextField` / `Input` / `Label` / `Description` / `FieldError` (+ `Form` / `Fieldset`) |
| Loading / connecting            | `Skeleton` / `Spinner`                                                                 |

Styling: HeroUI tokens only (no Tailwind utilities in our components, no bespoke
material), CSS Modules per component, verified in light and dark.

### Card anatomy

- **Header row:** monospace `name` · status `Chip` · `Edit` / `Remove` (right).
- **Transport summary:** `stdio · <command> <args…>` or `http · <url>` (truncated,
  monospace). On `error`, an `Alert`/inline reason line below.
- **Footer row:** "Enable for" → `Chat` / `Coding` switches; `Reconnect` shown
  only when the server is enabled (any of `connecting`/`connected`/`error`), never
  for `not-enabled`.
- **Tools:** a `Disclosure` (`N tools`) expanding to the discovered tool list;
  hidden when the server has no tools.

### Add/Edit modal

`ServerFormModal` on HeroUI `Modal`. Fields, in order:

1. `Name` — `TextField`; kebab-case hint (`^[a-z0-9][a-z0-9-]*$`) noting it
   namespaces tools as `mcp__<name>__…`; **read-only in edit mode**.
2. `Transport` — `ToggleButtonGroup`, `stdio` / `Streamable HTTP`.
3. Transport-specific fields **swap** on the selection:
   - **stdio:** `Command` (`TextField`) → `Arguments` (`StringListEditor`) →
     `Environment variables` (`KeyValueEditor`).
   - **http:** `URL` (`TextField`) → `Headers` (`KeyValueEditor`), with a note
     that only static headers are supported this round (bearer token / API key;
     no OAuth).
4. Footer: `Cancel` / `Add` (label `Save` in edit mode).

`useServerForm` validates on submit against the exported `mcpServerSchema` plus a
**uniqueness check** against existing names (skipping the row being edited).
Switching transport preserves `name` and clears the other transport's fields.

## Save semantics (`useMcpConfig`)

Holds `servers` + `enabledByAgent` loaded from the three settings leaves. Every
mutation writes whole arrays via `/settings/batch` (atomic), then reloads config
and asks the container to refetch status:

- **add(server)** → `mcp/servers = [...servers, server]` (server starts enabled
  nowhere).
- **update(server)** → replace the entry with the same `name` in `mcp/servers`
  (name immutable ⇒ no `enabledByAgent` change).
- **remove(name)** → single batch: drop from `mcp/servers` **and** from both
  `mcp/enabledByAgent/*` arrays.
- **setEnabled(name, agentType, enabled)** → write that one
  `mcp/enabledByAgent/<agentType>` array with the name added/removed.

Load failure → `LoadError` with retry (Workspaces pattern). Save failure →
`toast.danger`; client-side validation (name format + uniqueness) plus the
settings manager's schema check (the `mcp/servers` duplicate-name refinement)
guard invalid writes.

## Status + reconnect (`useMcpStatus`)

- Fetch `getMcpServers()` on mount.
- Poll on a ~4s `setInterval` while mounted and `document.visibilityState ===
'visible'`; register a `visibilitychange` listener to pause/resume; clear on
  unmount.
- `reconnect(name)` → `POST /api/mcp/servers/:name/reconnect`, then refetch (the
  poll also catches the `connecting → connected/error` transition).
- Status load failure is **non-blocking**: exposed as an unobtrusive
  "status unavailable" state; the config list still renders and stays editable.

## Package / API changes

- **`@omnicraft/settings-schema`** — export the runtime `mcpServerSchema` (and
  `mcpTransportSchema`) values for form validation. Their types (`McpServer`,
  `McpTransport`) are already exported; add the `export const` + index entry.
- **`@omnicraft/api-schema`** — the `'disabled'` enum trim (above). No other
  change; `getMcpServersResponseSchema` and its types are already exported.
- **New FE api module** `apps/frontend/src/api/mcp/` — `getMcpServers()` (GET
  `/api/mcp/servers`, parse `getMcpServersResponseSchema`) and
  `reconnectMcpServer(name)` (POST reconnect; 404 → throw).
- **New FE settings api** `apps/frontend/src/api/settings/mcp/` — typed accessors
  over the three MCP leaves: `getMcpConfig()` (parallel `getSettingValue` reads,
  parsed with the schemas) and `putMcpConfig({servers?, chat?, coding?})`
  (builds `/settings/batch` entries for the given leaves; supports the atomic
  multi-leaf remove and single-leaf toggle).

## Routing / navigation

- `apps/frontend/src/routes.ts` — add `mcp: {servers: {}}` under `settings`.
- `SettingsPage.tsx` `SETTINGS_NAV_ITEMS` — add group `MCP` with child `Servers`
  (`{id:'mcp', label:'MCP', children:[{id:'mcp.servers', label:'Servers',
path: ROUTES.settings.mcp.servers()}]}`), consistent with Tools → Search.
- `router/lazy-pages.tsx` — lazy `McpServersSection`.
- `router/router.tsx` — child route under `ROUTES.settings()`.
- `routes.test.ts` — extend if it asserts the route set.

## Testing

- **Backend:** `mcp-manager.test.ts` (or the api-schema schema test) — assert the
  status enum no longer includes `'disabled'` and existing status mapping is
  unchanged.
- **settings-schema:** `schema.test.ts` — `mcpServerSchema`/`mcpTransportSchema`
  exports validate/reject representative stdio + http servers.
- **Frontend (Vitest):**
  - `merge-servers.test.ts` — join by name; enablement flags; `not-enabled`
    only when both arrays exclude a server; config order preserved;
    status-missing-but-enabled → not falsely "not enabled".
  - `useServerForm` — name regex + uniqueness (excluding self on edit); http URL
    required/valid; transport switch preserves name and clears other fields.
  - `useMcpConfig` — add/update/remove/setEnabled build the correct
    `/settings/batch` payloads (mocked api); remove clears both enablement arrays.
  - `ServerFormModal` render test (mirroring `NewSessionModal.test.tsx`).
- **Manual:** verify the page, modal, switches, reconnect, and empty/error states
  in a real browser in **both light and dark** themes (frontend CLAUDE.md
  requirement), against a real stdio server (e.g.
  `npx -y @modelcontextprotocol/server-filesystem`).

## Files changed

**Backend / packages**

1. `packages/api-schema/src/mcp/schema.ts` — drop `'disabled'` from the status enum.
2. `packages/settings-schema/src/mcp/schema.ts` — `export const mcpServerSchema`, `mcpTransportSchema`.
3. `packages/settings-schema/src/index.ts` — export the two schemas.
4. `packages/settings-schema/src/mcp/schema.test.ts` — export-validation cases (if not covered).

**Frontend api**

5. `apps/frontend/src/api/mcp/mcp.ts` + `index.ts` — status + reconnect client.
6. `apps/frontend/src/api/settings/mcp/mcp.ts` + `index.ts` — typed MCP settings-leaf accessors.

**Frontend page**

7. `apps/frontend/src/pages/settings/sections/mcp/servers/**` — the section (container, view, hooks, helpers, components) per the tree above.
8. `apps/frontend/src/routes.ts` — `settings.mcp.servers`.
9. `apps/frontend/src/pages/settings/SettingsPage.tsx` — MCP nav group.
10. `apps/frontend/src/router/lazy-pages.tsx` — lazy `McpServersSection`.
11. `apps/frontend/src/router/router.tsx` — child route.
12. `apps/frontend/src/routes.test.ts` — if it asserts the route set.
