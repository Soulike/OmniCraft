# Agent-Specific Session Creation

## Problem

All agent types (Chat, Coding) share a single `createSessionRequestSchema` where
`workspace` and `extraAllowedPaths` are optional. This is incorrect:

- **Chat Agent** does not need `workspace` or `extraAllowedPaths` at all.
- **Coding Agent** requires `workspace` to function properly, but the schema
  and frontend don't enforce this.

## Design

Differentiate session creation per agent type across 4 layers: api-schema,
backend router, frontend API, and frontend context/page.

### 1. api-schema (`packages/api-schema`)

**Remove** the shared `createSessionRequestSchema`.

**Add** `createCodingSessionRequestSchema`:

```typescript
export const createCodingSessionRequestSchema = z.object({
  workspace: z.string(),
  extraAllowedPaths: z.array(z.string()).optional(),
});
```

Chat has no request schema — the router ignores whatever body is sent.

### 2. Backend Router (`apps/backend/src/dispatcher/agent-session/router.ts`)

In the `POST /:agentType/session` handler, switch on `agentType`:

- **Chat**: Skip body parsing entirely. Pass empty options to the service.
- **Coding**: Parse body with `createCodingSessionRequestSchema`. Pass
  `workspace` and `extraAllowedPaths` to the service.

```typescript
let options: CreateSessionOptions = {};
switch (agentType) {
  case AgentType.CHAT:
    break;
  case AgentType.CODING: {
    const body = createCodingSessionRequestSchema.parse(ctx.request.body);
    options = {
      workspace: body.workspace,
      extraAllowedPaths: body.extraAllowedPaths,
    };
    break;
  }
}
```

### 3. Backend Service (`apps/backend/src/services/agent-session/agent-session-service.ts`)

`CreateSessionOptions` interface keeps all fields optional — the router is the
validation boundary. No changes needed.

### 4. Frontend API (`apps/frontend/src/api/`)

**`agent-session.ts`**: Keep the generic `createSession(agentType, options?)`
function as-is. It's the low-level transport. `CreateSessionOptions` stays
as-is (all optional). No longer needs to be exported since per-agent wrappers
now define their own signatures.

**`chat.ts`**: `createSession()` takes no parameters.

```typescript
export async function createSession(): Promise<string> {
  return agentSessionApi.createSession(AgentType.CHAT);
}
```

**`coding.ts`**: `createSession()` keeps optional params to stay compatible
with the shared `ChatSessionApi` context interface (property-style function
types are contravariant under `strictFunctionTypes`, so a required-param
signature would not be assignable to the optional-param context type).

```typescript
export async function createSession(
  options: CreateSessionOptions = {},
): Promise<string> {
  return agentSessionApi.createSession(AgentType.CODING, options);
}
```

### 5. Frontend Context/Page Layer

**`ChatSessionApi` interface**: No changes needed. Keep
`createSession(options?)` with optional params. Both `chat.createSession()`
(0 params) and `coding.createSession(opts?)` are assignable.

**`SessionConfigProvider`**: Stays in `ChatPage` for future extensibility.

**`CodingPage`**: Add a guard in `createNewSessionIdWithConfig` — if
`selectedWorkspace` is `undefined`, show an error instead of creating a
session. This is the frontend enforcement that workspace is required for
Coding.

**`ChatPage`**: Already calls `createNewSessionId()` without config — no change
needed.

### Enforcement Summary

| Layer             | Chat            | Coding                                                      |
| ----------------- | --------------- | ----------------------------------------------------------- |
| Backend schema    | No body parsing | `workspace` required via `createCodingSessionRequestSchema` |
| Frontend API type | No params       | Optional params (for context compatibility)                 |
| Frontend page     | No constraint   | Guard: `selectedWorkspace` must be defined                  |

## Files to Modify

| File                                                  | Change                                                                      |
| ----------------------------------------------------- | --------------------------------------------------------------------------- |
| `packages/api-schema/src/chat/schema.ts`              | Remove `createSessionRequestSchema`, add `createCodingSessionRequestSchema` |
| `packages/api-schema/src/chat/index.ts`               | Update exports                                                              |
| `apps/backend/src/dispatcher/agent-session/router.ts` | Switch on agentType for schema selection                                    |
| `apps/frontend/src/api/chat/chat.ts`                  | Remove options parameter from `createSession`                               |
| `apps/frontend/src/api/coding/coding.ts`              | No signature change (stays compatible with context)                         |
| `apps/frontend/src/pages/coding/CodingPage.tsx`       | Guard `selectedWorkspace` in `createNewSessionIdWithConfig`                 |

## Out of Scope

- Renaming `ChatSessionApi` to a more generic name — orthogonal concern.
