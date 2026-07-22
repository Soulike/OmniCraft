# MCP Tools Support

## Problem

OmniCraft has no way to use external [Model Context Protocol](https://modelcontextprotocol.io)
tool servers. All tools are authored in-repo as `ToolDefinition`s. Users want to
plug in MCP servers — both **local** (spawned over stdio) and **remote**
(Streamable HTTP) — and expose their tools to the chat and coding agents.

Neither provider's native MCP connector fits: the Anthropic Messages API
connector and the OpenAI Responses `mcp` tool are **remote-only** and diverge
per provider. We call both providers behind one neutral seam
(`agent-core/llm-api`), and we need **local stdio** support. So we integrate a
**client-side bridge** using the official `@modelcontextprotocol/sdk`, uniform
across both providers.

## Scope of this round

This spec designs the **whole feature** (backend + HTTP API + a UX sketch) but
**implements the backend only**. The frontend (settings editor, connected-server
panel, MCP tool-call rendering) is designed here and built in a later round. The
one FE-visible change this round is a **contract change** to `@omnicraft/sse-events`
and `@omnicraft/tool-schemas` (below); the frontend must tolerate it before it
ships, which is covered by the existing "unknown tool" rendering fallback work
scheduled for the UX round.

## Decision

1. **Transports:** `stdio` (local child process) and `http` (Streamable HTTP).
   No legacy standalone SSE transport.
2. **Surface:** tools only. No MCP resources or prompts (they are user/app-driven
   by MCP's control model and imply UX with no trigger this round).
3. **Configuration:** a self-contained `mcp` settings section holding a **global
   server list** plus **per-agent enablement** keyed by `AgentType`.
4. **Consent:** trust all configured servers this round (no per-call approval).
   Approval gating is a tracked follow-up (see Out of scope).
5. **Integration:** a **standalone `McpManager` subsystem** (connections,
   discovery, `callTool`, lifecycle) plus a **thin `McpToolRegistry` adapter**
   that presents MCP tools through the existing tool seam, reusing the agent
   turn loop, executor, and SSE emission unchanged.
6. **Tool typing:** `ToolDefinition` becomes a **discriminated union** over a
   shared base — `kind: 'internal'` (today's Zod-typed tool, unchanged) and
   `kind: 'mcp'` (raw JSON Schema, `unknown` I/O).
7. **Schema handling:** the MCP server's JSON Schema is fed **straight to the LLM
   SDK** — no Zod conversion in either direction. The SDKs already accept JSON
   Schema for tool parameters, so a `fromJSONSchema`/`toJSONSchema` round-trip
   would be redundant and lossy.

## Architecture

```
              boot (init-services)  ─┐   SettingsManager onChange ────────┐
              initial applyConfig    │   (emitted after each save())      │
                                     ▼                                    ▼
                            ┌──────────────────────────────────────────────┐
                            │                 McpManager                    │
                            │  (apps/backend/src/models/mcp-manager)         │
                            │  applyConfig(mcp): reconcile desired state,    │
                            │    connect/disconnect servers in background    │
                            │  in-memory per server:                         │
                            │    { name, kinds:Set<AgentType>, status,       │
                            │      tools: McpToolInfo[], error? }            │
                            │  callTool(server, tool, args, signal)          │
                            │  list() → status snapshot for the HTTP API     │
                            └───────────────┬───────────────────────────────┘
                                            │ synchronous reads (no await, no disk)
              ┌─────────────────────────────┴──────────────────────────────┐
       getMcpToolRegistry(AgentType.CHAT)               getMcpToolRegistry(AgentType.CODING)
       (shared per-AgentType singleton)                 (shared per-AgentType singleton)
              │  getAll() ← called once per user message by buildAvailableTools()
              ▼
       for each server where kinds.has(myKind) and status==='connected':
         map McpToolInfo → McpToolDefinition
           name: mcp__<server>__<tool>, inputJsonSchema: tool.inputSchema,
           execute(args) ⇒ manager.callTool(server, tool, args, signal)
              │
              ▼  merged into the same availableTools map, run through the
                 existing agent-turn-runner + agent-tool-executor + SSE
```

Two facts drive this shape:

- **`ToolRegistry.getAll()` is synchronous** and `buildAvailableTools()` runs it
  **once at the start of each user message** (`AgentTurnRunner.run()`), not per
  tool-call round. So the registry cannot `await` settings or the network; it
  reads an in-memory snapshot the manager owns (discovered tools + each server's
  enabled `kinds` from the last `applyConfig`), making `getAll(kind)` a pure sync
  filter+map. Because the snapshot is taken per message, toggling a server or a
  completed (re)connection takes effect on the **next user message** — no restart.
- **`SettingsManager` emits a `change` event after every successful `save()`**
  — a small, general capability added this round (see "SettingsManager change
  events"), with MCP as its first consumer. McpManager subscribes and calls
  `applyConfig(settings.mcp)` on each change, plus once at boot for the initial
  state. Config is pushed by the manager, never polled.

`applyConfig` reconciles desired vs. live state and starts (re)connections in the
**background**, returning promptly — a settings write must not block on network
connects. Connection progress is observable via the HTTP status API.

**Availability timing (best-effort).** Because connections complete
asynchronously and the tool set is frozen per user message, a newly-connected
server's tools appear on the **next user message**, not mid-message. At boot this
is a race: a message sent before servers finish connecting runs without their
tools; they appear on a later message. Conversely, a server that drops
mid-message stays in that message's snapshot, and a call to it fails gracefully
(error result). There is **no UI indicator of boot-time connection status** this
round — tracked as a follow-up
([#361](https://github.com/Soulike/OmniCraft/issues/361)).

## Tool type model

`agent-core/tool/types.ts` — `ToolDefinition` becomes a union over a shared base:

```ts
/** Fields common to every tool, regardless of origin. */
interface ToolDefinitionBase {
  readonly name: string;
  readonly displayName: string;
  readonly description: string;
  readonly suppressToolEvents: boolean;
  readonly compactResult?: (input: ToolCompactResultInput) => string | null;
}

/** Internal, in-repo tool. Unchanged from today except the `kind` tag. */
export interface ToolDefinition<
  TParams extends z.ZodType = z.ZodType,
  TResult = unknown,
> extends ToolDefinitionBase {
  readonly kind: 'internal';
  readonly parameters: TParams;
  execute(
    args: z.infer<TParams>,
    context: ToolExecutionContext,
    onOutput?: (chunk: string) => void,
  ): Promise<ToolExecuteResult<TResult>> | ToolExecuteResult<TResult>;
}

/** External MCP tool. Raw JSON Schema, unknown I/O, no Zod. */
export interface McpToolDefinition extends ToolDefinitionBase {
  readonly kind: 'mcp';
  readonly inputJsonSchema: Record<string, unknown>;
  execute(
    args: unknown,
    context: ToolExecutionContext,
    onOutput?: (chunk: string) => void,
  ): Promise<ToolExecuteResult<unknown>> | ToolExecuteResult<unknown>;
}

/** The type shared machinery operates on. */
export type AnyToolDefinition = ToolDefinition | McpToolDefinition;
```

- `ToolDefinition` **keeps its name and generics** so the 19 existing
  `ToolDefinition<typeof params, Result>` literals keep type-checking. Each gains
  one field: `kind: 'internal'`. `createMockTool` in `tool/testing.ts` gains it too.
- The union gets the **new** name `AnyToolDefinition`. Consumers discriminate on
  the explicit tag:

  ```ts
  // provider adapters
  const schema =
    tool.kind === 'mcp'
      ? tool.inputJsonSchema
      : z.toJSONSchema(tool.parameters);
  // executor
  const raw = JSON.parse(toolCall.arguments);
  const args = tool.kind === 'mcp' ? raw : tool.parameters.parse(raw);
  ```

- MCP tools carry **no Zod schema** and are **not locally validated** — the MCP
  server validates authoritatively and returns errors, which is correct (the
  server owns its own schema).

**Migration surface** (mechanical widening `ToolDefinition[]` → `AnyToolDefinition[]`,
no behavior change): `ToolRegistry` (`register`/`get`/`getAll`), `agent-catalog`,
`llm-session` + compaction modules, `agent-turn-runner`, `agent`, `llm-api/types`,
the two provider adapters, and `tool/testing.ts`.

## SettingsManager change events

`McpManager` needs to react when settings change. Rather than couple the settings
service to MCP, `SettingsManager` gains a small, general change-notification
capability this round (MCP is its first consumer):

- **Typed subscription.**
  `onChange(listener: (settings: Settings) => void): () => void` registers a
  listener and returns an unsubscribe function, backed by an internal `Set`.
  (Kept typed rather than a stringly-typed `EventEmitter` to avoid `any`.)
- **Emit after `save()`.** `save()` is the single persistence choke-point (used
  by `set`, `setBatch`, and the create-time reset). After the atomic `tmp+rename`
  completes it notifies listeners with the **validated `Settings` just written** —
  so the payload is complete, never a half-written file, and no subscriber
  re-reads from disk. Notification runs **after** the `ioQueue` critical section
  (via a microtask) to avoid re-entrancy, and each listener is wrapped so a
  throwing listener is logged and cannot fail the write.
- **Cleanup.** A `dispose()` clears listeners and is invoked by
  `resetInstanceForTesting()`.

Chosen over a filesystem watcher for simplicity and correctness: emitting from
`save()` fires only on our own completed writes, sidestepping `fs.watch`'s
atomic-rename/inode pitfalls, event debouncing, and half-written-file reads.

**Known limitation (accepted):** direct hand-edits to `settings.json` on disk are
**not** reactive — they take effect on the next restart, matching the app's
current behavior (nothing reacts to live external edits today). A file watcher
can be layered on later if that need arises.

## Changes

### 1. Dependency

Add `@modelcontextprotocol/sdk` to `apps/backend` via `pnpm add`
(never hand-write the version). Used: the MCP `Client`, `StdioClientTransport`,
and `StreamableHTTPClientTransport`. Confirm the exact import subpaths against the
installed version during implementation.

### 2. Relocate `AgentType` to `@omnicraft/settings-schema`

The `mcp` settings section keys enablement by `AgentType`, but `settings-schema`
cannot depend on `api-schema` (the dependency runs the other way), and the repo
forbids re-exporting a workspace package's exports. `AgentType`/`agentTypeSchema`
(the `chat`/`coding` enum) currently lives in `api-schema` and has **zero external
consumers**, so:

- Create `packages/settings-schema/src/agent-type/schema.ts` with `AgentType`,
  `type AgentType`, and `agentTypeSchema` (moved verbatim).
- Export them from `packages/settings-schema/src/index.ts`.
- Delete `packages/api-schema/src/agent-type/schema.ts` and its re-export line in
  `packages/api-schema/src/index.ts`.

(The unrelated `SubAgentType` in `api-schema` is untouched.)

### 3. Settings schema — new `mcp` section (`packages/settings-schema`)

Create `src/mcp/schema.ts`:

```ts
import {z} from 'zod';
import {AgentType, agentTypeSchema} from '../agent-type/schema.js';

const mcpTransportSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('stdio'),
    command: z.string().describe('Executable to spawn'),
    args: z.array(z.string()).describe('Command arguments').default([]),
    env: z
      .record(z.string(), z.string())
      .describe('Extra environment variables')
      .default({}),
  }),
  z.object({
    type: z.literal('http'),
    url: z.url().describe('Streamable HTTP endpoint URL'),
    headers: z
      .record(z.string(), z.string())
      .describe('Extra request headers')
      .default({}),
  }),
]);

const mcpServerSchema = z.object({
  name: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]*$/)
    .describe(
      'Unique server id; also namespaces its tools as mcp__<name>__<tool>',
    ),
  transport: mcpTransportSchema,
});

const enabledByAgentSchema = z.object({
  [AgentType.CHAT]: z
    .array(z.string())
    .describe('Server names enabled for the chat agent')
    .default([]),
  [AgentType.CODING]: z
    .array(z.string())
    .describe('Server names enabled for the coding agent')
    .default([]),
} satisfies Record<AgentType, z.ZodType>);

export const mcpSettingsSchema = z.object({
  servers: z
    .array(mcpServerSchema)
    .describe('Configured MCP servers')
    .default([]),
  enabledByAgent: enabledByAgentSchema.prefault({}),
});
```

- The `satisfies Record<AgentType, z.ZodType>` guard fails to compile if a new
  `AgentType` is added without a corresponding enablement key.
- Compose into `src/schema.ts`: `mcp: mcpSettingsSchema.prefault({})`.
- Must remain `z.toJSONSchema()`-convertible (the existing schema test enforces
  it). Discriminated union → `oneOf`, record → `additionalProperties` — all
  supported.
- Editing rides the existing leaf-path system: `mcp/servers`,
  `mcp/enabledByAgent/chat`, `mcp/enabledByAgent/coding` are array leaves (same
  shape as `fileAccess/workspaces`), PUT as whole arrays via `/settings/batch`.
- **Identity by `name`** (kebab-case, unique) — used both as the enablement
  reference and the tool-namespace prefix.
- **Dangling references are soft-ignored:** an enabled name with no matching
  server is skipped at filter time. No cross-field validation, so an otherwise
  valid settings write never becomes un-saveable (the settings manager
  backs-up-and-resets on schema-invalid files).

### 4. MCP manager (`apps/backend/src/models/mcp-manager/`)

New singleton, following the `vscode-server-manager` pattern (it already manages
spawned processes). Holds an in-memory record per server:
`{ name, transportType, kinds: Set<AgentType>, status: 'connecting'|'connected'|'error'|'disabled', tools: McpToolInfo[], error?: string }`
where `McpToolInfo = { name, title?, description, inputSchema }`.

API:

- `applyConfig(mcp: McpSettings): void` — compute each server's `kinds` from
  `enabledByAgent`; connect servers enabled for ≥1 kind, disconnect the rest,
  reconnect servers whose transport changed. Returns promptly; connection +
  `tools/list` run in the background and populate `tools`/`status`. Subscribe to
  the server's `tools/list_changed` to refresh `tools`.
- `getToolsForAgent(kind: AgentType): McpServerTools[]` — synchronous; returns
  connected servers whose `kinds` include `kind`, with their tools. Consumed by
  `McpToolRegistry.getAll()`.
- `callTool(server, tool, args, signal): Promise<McpCallResult>` — proxy to the
  MCP client; maps `signal` to cancellation.
- `list(): McpServerStatus[]` — snapshot for the HTTP API.
- `reconnect(name): Promise<void>` — force a single server reconnect.

Connection uses `Client` + `StdioClientTransport` (command/args/env) or
`StreamableHTTPClientTransport` (url/headers). Connection failures set
`status: 'error'` + `error`; they never throw out of `applyConfig`.

### 5. Tool bridging (`apps/backend/src/agent/tools/mcp/`)

`McpToolRegistry extends ToolRegistry`, parameterized by `AgentType`. It is
**stateless** — it reads the shared `McpManager` snapshot on every call — so a
single instance is shared **per agent type**, not one per agent/session instance
(matching the module-level singleton pattern of the other registries). A lazy,
memoized factory keyed by `AgentType` provides them:

```ts
const registries = new Map<AgentType, McpToolRegistry>();

/** Shared, lazily-created MCP tool registry for an agent type. */
export function getMcpToolRegistry(agentType: AgentType): McpToolRegistry {
  const existing = registries.get(agentType);
  if (existing) return existing;
  const registry = new McpToolRegistry(agentType);
  registries.set(agentType, registry);
  return registry;
}
```

Overrides:

- `getAll(): AnyToolDefinition[]` — `mcpManager.getToolsForAgent(this.kind)`,
  mapping each `McpToolInfo` to an `McpToolDefinition`:
  - `kind: 'mcp'`
  - `name: mcp__${server}__${tool}` (guarantees uniqueness against the
    `buildAvailableTools` duplicate-name check)
  - `displayName: tool.title ?? tool.name`, `description: tool.description ?? ''`
  - `inputJsonSchema: tool.inputSchema`
  - `suppressToolEvents: false`
  - `execute(args, ctx)` → `mcpManager.callTool(server, tool.name, args, ctx.signal)`,
    mapping the result (below)
- `get(name)` — same, by name.
- `getSystemPromptSection()` — a short section listing the agent's connected MCP
  servers and tool counts (empty string when none).

Because the base `register()`/private map is for static tools, this registry
does not use them; it computes tools live from the manager. Production wiring
goes through `getMcpToolRegistry`; tests construct `new McpToolRegistry(kind)`
directly for isolation (per the base class's testing note).

**Result mapping** (`McpCallResult` → `ToolExecuteResult`): concatenate MCP text
content blocks into `content` (non-text blocks summarized as a short placeholder
note). On `isError: true`, return a `ToolExecuteFailureResult` (`status: 'failure'`,
`toolFailureData`). On success, `data` is a generic `mcpToolResultSchema`
(§7): `{ server, toolName, text }`.

### 6. Provider adapters + executor (`apps/backend/src/agent-core`)

- `llm-api/claude/helpers.ts` `toClaudeTool` and
  `llm-api/openai-responses/helpers.ts` `toFunctionTool`: accept
  `AnyToolDefinition`; compute the JSON Schema as
  `tool.kind === 'mcp' ? tool.inputJsonSchema : z.toJSONSchema(tool.parameters)`.
  The existing `type: "object"` assertion in `toClaudeTool` still holds — MCP
  input schemas are objects.
- `agent/agent-tool-executor.ts`: parse arguments, then
  `const args = tool.kind === 'mcp' ? raw : tool.parameters.parse(raw)` before
  `tool.execute(args, ...)`. Everything else (parallel exec, abort, error→failure
  mapping, SSE) is unchanged and now serves MCP tools for free.

### 7. FE↔BE boundary (`packages/sse-events`, `packages/tool-schemas`)

- `tool-schemas/src/result-schemas.ts`: add
  `mcpToolResultSchema = z.object({ server: z.string(), toolName: z.string(), text: z.string() })`.
- `tool-schemas/src/registry.ts`: add `mcpToolResultSchema` to the
  `toolResultDataSchema` union. Export from `src/index.ts`.
- `sse-events/src/schema.ts`: relax `sseToolExecuteStartEventSchema.toolName`
  from `toolNameSchema` to `z.string()` (built-ins still use `TOOL_NAME`; MCP
  uses `mcp__…`). Document that consumers must handle non-`TOOL_NAME` values.
  `tool-execute-end.data` gains the MCP member automatically via the widened
  union.

MCP tool errors reuse the existing `toolFailureDataSchema` path — no separate
error shape.

### 8. HTTP API (`apps/backend/src/dispatcher/mcp/`)

New dispatcher resource (`index.ts` + `path.ts` + `router.ts`), mounted under
`/api`, following the existing resource-folder convention. Response schemas in a
new `packages/api-schema/src/mcp/schema.ts`.

- `GET /api/mcp/servers` →
  `[{ name, transportType, status, tools: [{ name, description }], error? }]`
  — powers the connected-servers panel and tool listing in the UX.
- `POST /api/mcp/servers/:name/reconnect` → 202; triggers `mcpManager.reconnect`.

Server **configuration** editing reuses the existing `/settings/*` endpoints —
no new write endpoint.

### 9. Wiring

- `agent/agents/main-agent/main-agent.ts`: add `getMcpToolRegistry(AgentType.CHAT)`
  to `toolRegistries`.
- `agent/agents/coding-agent/coding-agent.ts`: add
  `getMcpToolRegistry(AgentType.CODING)`.
- `startup/init-services.ts`: after the settings manager is ready, create the
  `McpManager` singleton, subscribe it to settings changes
  (`settingsManager.onChange(s => mcpManager.applyConfig(s.mcp))`), and run the
  initial `applyConfig(settings.mcp)` (the event only fires on subsequent saves).
- `services/settings/settings-service.ts` is **unchanged** — no MCP coupling in
  the service layer. Server-config changes reach the manager purely through the
  `SettingsManager` change event.

## UX (designed now, built in a later round)

- **Settings → MCP page:** add/edit/remove servers (name, transport picker with
  stdio `command`/`args`/`env` or http `url`/`headers`); per-agent enable
  checkboxes (Chat / Coding) backed by `mcp.enabledByAgent`.
- **Connected-servers panel:** live status + discovered tools per server, from
  `GET /api/mcp/servers`, with a reconnect button.
- **Chat rendering:** a generic MCP tool-call card keyed off the `mcp__` name
  prefix and the `mcpToolResultSchema` result shape (the "unknown tool"
  fallback the relaxed `toolName` requires).

## Testing

- **settings-schema** (`schema.test.ts`): `mcp` defaults; schema still converts
  via `z.toJSONSchema`; the `enabledByAgent` keys cover every `AgentType`.
- **SettingsManager** (`settings-manager.test.ts`): `onChange` fires after a
  successful `save()` (`set`/`setBatch`) with the validated settings; multiple
  listeners each notified; unsubscribe stops delivery; a listener that throws is
  isolated (logged, write still succeeds); `dispose()` clears listeners.
- **McpManager**: unit tests against a fake MCP client/transport — connect →
  tools populate; `applyConfig` reconciles (connect new, disconnect removed,
  update `kinds`); a settings `change` event triggers reconciliation;
  `getToolsForAgent` filters by kind + status; `callTool` success and `isError`
  mapping; connection failure sets `status: 'error'` and never throws.
- **McpToolRegistry**: kind filtering; dangling-reference skip; `mcp__…`
  namespacing; result → `ToolExecuteResult` mapping; empty when no servers.
- **executor**: `kind: 'mcp'` path skips Zod parse and passes raw args;
  `kind: 'internal'` path unchanged.
- **adapters**: `toClaudeTool`/`toFunctionTool` emit `inputJsonSchema` verbatim
  for MCP tools and preserve behavior for internal tools.
- **dispatcher**: `GET /api/mcp/servers` shape; `reconnect` returns 202.

## Out of scope (follow-ups)

- **Consent gating** — per-server auto-approve or per-call approval via the
  existing `UserInteractionBridge`; this round trusts configured servers.
  ([#360](https://github.com/Soulike/OmniCraft/issues/360))
- **Boot-time connection-status indicator** in the UI — the backend already
  exposes per-server status via `GET /api/mcp/servers`; the frontend affordance
  is deferred. ([#361](https://github.com/Soulike/OmniCraft/issues/361))
- **Frontend MCP settings UX** (configure servers + per-agent enable), plus the
  connected-servers panel and chat tool-call rendering — designed above, built
  later. ([#362](https://github.com/Soulike/OmniCraft/issues/362))
- MCP **resources** and **prompts**.
- **Per-conversation** server selection (this round is global + per-agent).
- **OAuth** for HTTP servers (static headers only this round).
- **Legacy standalone SSE** transport.
- Full MCP **content-block fidelity** in the neutral result layer (text-only for
  now).

## Files changed

1. `apps/backend/package.json` — add `@modelcontextprotocol/sdk` (via pnpm)
2. `packages/settings-schema/src/agent-type/schema.ts` — new home for `AgentType`
3. `packages/settings-schema/src/index.ts` — export `AgentType`/`agentTypeSchema`
4. `packages/api-schema/src/agent-type/schema.ts` — deleted
5. `packages/api-schema/src/index.ts` — drop the `agent-type` re-export
6. `packages/settings-schema/src/mcp/schema.ts` — new `mcp` section
7. `packages/settings-schema/src/schema.ts` — compose `mcp`
8. `packages/settings-schema/src/schema.test.ts` — MCP cases
9. `packages/tool-schemas/src/result-schemas.ts` — `mcpToolResultSchema`
10. `packages/tool-schemas/src/registry.ts` — add to `toolResultDataSchema`
11. `packages/tool-schemas/src/index.ts` — export `mcpToolResultSchema`
12. `packages/sse-events/src/schema.ts` — relax `tool-execute-start.toolName`
13. `packages/api-schema/src/mcp/schema.ts` — HTTP response schemas
14. `packages/api-schema/src/index.ts` — export MCP API schemas
15. `apps/backend/src/agent-core/tool/types.ts` — union tool model
16. `apps/backend/src/agent-core/tool/testing.ts` — `kind: 'internal'` in mock
17. `apps/backend/src/agent/tools/**/*.ts` — add `kind: 'internal'` (18 literals)
18. `apps/backend/src/agent-core/tool/load-skill.ts` — `kind: 'internal'` (19th literal)
19. `apps/backend/src/agent-core/tool/tool-registry.ts` — `AnyToolDefinition`
20. `apps/backend/src/agent-core/agent/catalog/agent-catalog.ts` — `AnyToolDefinition`
21. `apps/backend/src/agent-core/llm-session/**` — widen tool element type
22. `apps/backend/src/agent-core/agent/agent-turn-runner.ts` — widen tool type
23. `apps/backend/src/agent-core/agent/agent.ts` — widen tool type
24. `apps/backend/src/agent-core/llm-api/types.ts` — widen tool type
25. `apps/backend/src/agent-core/llm-api/claude/helpers.ts` — kind discrimination
26. `apps/backend/src/agent-core/llm-api/openai-responses/helpers.ts` — kind discrimination
27. `apps/backend/src/agent-core/agent/agent-tool-executor.ts` — kind discrimination
28. `apps/backend/src/models/settings-manager/settings-manager.ts` — `onChange` subscription, emit after `save()`, `dispose()`
29. `apps/backend/src/models/settings-manager/settings-manager.test.ts` — change-event tests
30. `apps/backend/src/models/mcp-manager/**` — new manager subsystem
31. `apps/backend/src/agent/tools/mcp/**` — `McpToolRegistry`
32. `apps/backend/src/dispatcher/mcp/**` — HTTP status/reconnect API
33. `apps/backend/src/dispatcher/index.ts` — mount the `mcp` router
34. `apps/backend/src/agent/agents/main-agent/main-agent.ts` — register MCP tools
35. `apps/backend/src/agent/agents/coding-agent/coding-agent.ts` — register MCP tools
36. `apps/backend/src/startup/init-services.ts` — create manager, subscribe to settings changes, initial `applyConfig`
