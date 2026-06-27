# Split agent-session into independent chat / coding chains

**Date:** 2026-06-27
**Status:** Approved

## Problem

Today a single dispatcher and a single service are parameterized by `agentType`
(`chat` | `coding`) and branch on it at runtime. The two agent flows are
therefore entangled in shared control flow, which makes them awkward to evolve
independently. We want two **completely independent** chains — one per agent
type — so the chat and coding flows can diverge freely in the future. The code
will look highly similar immediately after the split; that duplication is
intentional and exists to make future forking cheap.

## Goal

De-parameterize the request → handling → business-logic chain: remove the
`agentType` parameter and every `switch (agentType)` by forking each coupled
unit into a `chat-*` copy and a `coding-*` copy. Behavior and the public HTTP
contract are preserved byte-for-byte. After the split, the `AgentType` enum is
no longer referenced anywhere in the backend chains.

## Non-goals

- No change to the public HTTP contract. URLs remain `/api/chat/...` and
  `/api/coding/...` (today they are produced by `/:agentType/...` with
  `agentType ∈ {chat, coding}`, so two literal routers yield identical URLs).
- No splitting of `@omnicraft/api-schema`. The wire contract is genuinely
  identical across the two flows; the only per-type difference (the create-body)
  is already expressed as two separate schemas
  (`createSessionRequestSchema` = `{}` vs `createCodingSessionRequestSchema` =
  `{ workspace }`). Duplicating identical validators there buys no divergence
  freedom and invites drift.
- No splitting of the shared agent engine (`agent-core/*`, the `AgentStore`
  base class). `MainAgent` / `CodingAgent` and `MainAgentStore` /
  `CodingAgentStore` are already the per-type leaves.
- No splitting of the shared frontend UI module (`modules/chat-session`,
  `modules/chat-stream`) or its `ChatSessionApi` injection seam. The frontend
  analog of "dispatcher + service" is the network `api/` layer, which is the
  only frontend layer we fork.

## Already split (no work required)

- Agents: `MainAgent` (chat) / `CodingAgent` (coding).
- Stores: `MainAgentStore` / `CodingAgentStore` — separate singletons, separate
  on-disk dirs (`sessions/` vs `coding-sessions/`), already near-identical
  intentional duplication.
- Per-agent LLM settings: `settings.llm` vs `settings.codingLlm`.
- Frontend per-type facades: `api/chat/chat.ts` and `api/coding/coding.ts`
  already exist; they currently delegate to the shared module.

## Design

### 1. Backend dispatcher

Target structure under `src/dispatcher/`:

```
dispatcher/
  helpers/                       # NEW — shared, agent-agnostic SSE transport
    cursor.ts                    # parseSseResumeCursor (moved verbatim)
    sse.ts                       # writeSseEvent + pumpSseEvents (moved verbatim)
    cursor.test.ts
    sse.test.ts
  chat-agent-session/
    path.ts                      # '/chat/sessions', '/chat/session', ...
    router.ts                    # calls chatAgentSessionService; create body
                                 #   validated with createSessionRequestSchema
    index.ts
  coding-agent-session/
    path.ts                      # '/coding/sessions', ...
    router.ts                    # calls codingAgentSessionService; create body
                                 #   validated with createCodingSessionRequestSchema
    index.ts
```

- `validator.ts` (`parseAgentType`) is deleted. Paths are now literal, so an
  unknown type 404s naturally by failing to match any route.
- `pumpSseEvents` (currently an inline helper in `router.ts`, agent-agnostic)
  moves into shared `dispatcher/helpers/sse.ts`.
- The create handler loses its `switch (agentType)`: the chat router parses
  `createSessionRequestSchema`, the coding router parses
  `createCodingSessionRequestSchema`.
- `dispatcher/index.ts` mounts both routers (replacing the single
  `agentSessionRouter`). Mount order is irrelevant since the path prefixes are
  disjoint.
- The old `dispatcher/agent-session/` folder is removed.

The two routers are otherwise structurally identical: the same seven handlers
(list, create, completions, events, abort, tool-response, delete), each calling
its own service with no `agentType` argument.

### 2. Backend service

Target structure under `src/services/`:

```
services/
  chat-agent-session/
    chat-agent-session-service.ts  # chatAgentSessionService
    helpers.ts                     # getLlmConfig() -> settings.llm (no branch)
    types.ts                       # CreateSessionError {BASE_URL_NOT_CONFIGURED,
                                   #   MODEL_NOT_CONFIGURED} + CreateSessionResult
    index.ts
  coding-agent-session/
    coding-agent-session-service.ts # codingAgentSessionService
    helpers.ts                     # getLlmConfig() -> settings.codingLlm
    types.ts                       # CreateSessionError {+ WORKSPACE_* variants}
                                   #   + CreateSessionResult
    validation.ts                  # validateSessionPaths (coding only)
    validation.test.ts             # moved from services/agent-session/
    index.ts
```

Each service exposes the same method set as today, minus the `agentType`
parameter: `createSession`, `sendCompletion`, `subscribe`, `abortCompletion`,
`submitToolResponse`, `listSessions`, `deleteSession`.

- `getStore(agentType)` and the `switch (agentType)` agent construction both
  disappear. The chat service references `MainAgentStore` + `MainAgent`
  directly; the coding service references `CodingAgentStore` + `CodingAgent`
  directly.
- `getLlmConfig` loses its branch: chat reads `settings.llm`, coding reads
  `settings.codingLlm`.
- **Legitimate divergence reflected now:** `chatAgentSessionService.createSession()`
  takes no workspace (chat's create body is `{}`) and constructs
  `new MainAgent(undefined, sessionsDir)`. `codingAgentSessionService.createSession(workspace)`
  validates the workspace and constructs `new CodingAgent(workspace, sessionsDir)`.
  Consequently `validation.ts` and the `WORKSPACE_*` `CreateSessionError`
  variants live only in the coding chain. This is the single place the two
  copies legitimately differ today; everywhere else they are deliberately
  near-identical.
- The old `services/agent-session/` folder is removed.

### 3. Frontend api

- Inline the shared `api/agent-session/agent-session.ts` logic into the existing
  per-type facades:
  - `api/chat/chat.ts` hardcodes base `/api/chat`, defines its own
    `CreateSessionOptions`, and contains the seven request functions directly.
  - `api/coding/coding.ts` hardcodes base `/api/coding`, likewise.
- Shared frontend transport stays shared in `api/helpers/`: `parseSseStream`,
  `HttpError`, and `parseCursor` (the last relocated out of `agent-session.ts`
  into `api/helpers/`), mirroring the backend "keep shared transport" decision.
- Delete `api/agent-session/`.
- `ChatSessionApiContext.ts` currently imports `CreateSessionOptions` from the
  deleted module. Define `CreateSessionOptions` on the shared `ChatSessionApi`
  interface in the context file itself (the UI-level injection contract). TS is
  structural, so both `api/chat` and `api/coding` continue to satisfy it.
- `pages/chat/ChatPage.tsx` and `pages/coding/CodingPage.tsx` already import
  `@/api/chat` / `@/api/coding` and are untouched.

## Data flow (unchanged end-to-end)

```
Chat:   ChatPage → api/chat → POST /api/chat/...   → dispatcher/chat-agent-session
        → chatAgentSessionService → MainAgentStore / MainAgent
Coding: CodingPage → api/coding → POST /api/coding/... → dispatcher/coding-agent-session
        → codingAgentSessionService → CodingAgentStore / CodingAgent
```

No request, response, SSE-cursor, or status-code semantics change.

## Testing

- No existing dispatcher/service integration tests reference `agentType`, so
  there is nothing to rewrite there.
- `services/agent-session/validation.test.ts` moves to
  `services/coding-agent-session/`.
- `dispatcher/agent-session/helpers/cursor.test.ts` and `sse.test.ts` move to
  `dispatcher/helpers/`.
- Final verification: `bun run typecheck`, `bun run test` (Vitest), lint/format
  check, plus a dev-server browser smoke check of both the chat and coding pages
  in light and dark themes (frontend chain changed).

## Risks

- **Missed reference to the removed `agent-session` modules.** Mitigated by a
  repo-wide grep for `agent-session` / `agentSessionService` / `parseAgentType`
  after the move, plus typecheck.
- **Accidental contract drift between the two copies.** Mitigated by porting
  verbatim and diffing the two routers / services so the only differences are
  the intended ones (store/agent binding, llm-settings key, workspace handling).

```

```
