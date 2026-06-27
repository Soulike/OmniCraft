# Split agent-session into independent chat / coding chains — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fork the single `agentType`-parameterized dispatcher + service (backend) and the single shared frontend api module into two physically independent `chat` and `coding` chains, preserving behavior and the HTTP contract byte-for-byte.

**Architecture:** Pure structural refactor. Each coupled unit is duplicated into a `chat-*` copy and a `coding-*` copy, then the `agentType` parameter and every `switch (agentType)` are deleted. Agent-agnostic SSE transport helpers stay shared (one copy each on backend and frontend). The shared `@omnicraft/api-schema` contract, the `agent-core` engine, and the frontend `chat-session` UI module are deliberately NOT split. Because today's routes come from `/:agentType/...` with `agentType ∈ {chat, coding}`, two literal routers produce identical URLs, so the frontend keeps working and no schema changes.

**Tech Stack:** Bun (package manager + runtime), TypeScript (Node APIs only), Koa + @koa/router, Zod, Pino, Vitest, React + Vite (frontend).

**Spec:** `docs/specs/2026-06-27-split-agent-session-chains-design.md`

## Global Constraints

- This is a behavior-preserving refactor: the regression gate is the **existing test suite + typecheck staying green at every commit**, plus a grep for stale references. No new behavior is introduced.
- Runtime code uses Node.js APIs only (`node:*`). No Bun-specific APIs.
- Backend: no default exports; no `console` (use `logger`); no non-null `!` (use `assert`); relative imports use `.js`; `@/*` alias for cross-module imports; import order is lint-enforced (run `lint --fix` if order trips).
- Frontend: no default exports; CSS Modules only; import component folders via their `index.ts`.
- Commits follow Conventional Commits (`refactor(backend):`, `refactor(frontend):`, `docs:`). End every commit message with the trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Never split or modify `@omnicraft/api-schema`. Both chains import the existing schemas directly.
- Test command is `bun run ... test` (Vitest). Never `bun test` (Bun's runner gives false failures).

## File map

**Created**

- `apps/backend/src/services/chat-agent-session/{chat-agent-session-service.ts,helpers.ts,types.ts,index.ts}`
- `apps/backend/src/services/coding-agent-session/{coding-agent-session-service.ts,helpers.ts,types.ts,validation.ts,validation.test.ts,index.ts}`
- `apps/backend/src/dispatcher/helpers/{cursor.ts,sse.ts,cursor.test.ts,sse.test.ts}`
- `apps/backend/src/dispatcher/chat-agent-session/{path.ts,router.ts,index.ts}`
- `apps/backend/src/dispatcher/coding-agent-session/{path.ts,router.ts,index.ts}`

**Modified**

- `apps/backend/src/dispatcher/index.ts` (swap mounts)
- `apps/backend/src/dispatcher/CLAUDE.md` (note shared helpers)
- `apps/frontend/src/api/chat/chat.ts` (self-contained, base `/api/chat`)
- `apps/frontend/src/api/coding/coding.ts` (self-contained, base `/api/coding`)
- `apps/frontend/src/api/helpers/sse.ts` (add `parseCursor`)
- `apps/frontend/src/api/helpers/sse.test.ts` (add `parseCursor` tests)
- `apps/frontend/src/modules/chat-session/contexts/ChatSessionApiContext/ChatSessionApiContext.ts` (inline `CreateSessionOptions`)

**Deleted (in Task 3 / Task 4)**

- `apps/backend/src/dispatcher/agent-session/` (whole folder)
- `apps/backend/src/services/agent-session/` (whole folder)
- `apps/frontend/src/api/agent-session/` (whole folder)

---

### Task 1: Backend — fork the service into chat + coding (additive)

Create both new services. The old `services/agent-session/` stays in place (still used by the old dispatcher), so the build stays green; the new services are temporarily unused.

**Files:**

- Create: `apps/backend/src/services/chat-agent-session/types.ts`
- Create: `apps/backend/src/services/chat-agent-session/helpers.ts`
- Create: `apps/backend/src/services/chat-agent-session/chat-agent-session-service.ts`
- Create: `apps/backend/src/services/chat-agent-session/index.ts`
- Create: `apps/backend/src/services/coding-agent-session/types.ts`
- Create: `apps/backend/src/services/coding-agent-session/helpers.ts`
- Create: `apps/backend/src/services/coding-agent-session/validation.ts`
- Create: `apps/backend/src/services/coding-agent-session/validation.test.ts`
- Create: `apps/backend/src/services/coding-agent-session/coding-agent-session-service.ts`
- Create: `apps/backend/src/services/coding-agent-session/index.ts`

**Interfaces:**

- Consumes (existing, unchanged): `MainAgent`, `CodingAgent` from `@/agent/agents/index.js`; `MainAgentStore`, `CodingAgentStore` from `@/models/agent-store/index.js`; `SettingsManager` from `@/models/settings-manager/index.js`; `settingsService` from `@/services/settings/index.js`; `LlmConfig` from `@/agent-core/llm-api/index.js`; `AgentSseLogReaderOptions` from `@/agent-core/agent/index.js`; `checkDirectoryAccess` from `@/helpers/fs.js`.
- Produces:
  - `chatAgentSessionService` with `createSession(): Promise<CreateSessionResult>`, `sendCompletion(agentId: string, userMessage: string): Promise<boolean>`, `subscribe(agentId: string, options?: AgentSseLogReaderOptions): Promise<AsyncIterable<SseEventCursorEntry> | undefined>`, `abortCompletion(agentId: string): Promise<boolean>`, `submitToolResponse(agentId: string, interactionId: string, result: unknown): Promise<boolean>`, `listSessions(offset: number, limit: number): Promise<{sessions: SessionMetadata[]; total: number}>`, `deleteSession(agentId: string): Promise<boolean>`.
  - `codingAgentSessionService` with the same method set except `createSession(workspace: string): Promise<CreateSessionResult>`.

- [ ] **Step 1: Create `chat-agent-session/types.ts`**

```ts
/** Reasons why chat session creation can fail. */
export enum CreateSessionError {
  BASE_URL_NOT_CONFIGURED = 'BASE_URL_NOT_CONFIGURED',
  MODEL_NOT_CONFIGURED = 'MODEL_NOT_CONFIGURED',
}

/** Result of createSession: either success with sessionId, or failure with error. */
export type CreateSessionResult =
  | {success: true; sessionId: string}
  | {success: false; error: CreateSessionError};
```

- [ ] **Step 2: Create `chat-agent-session/helpers.ts`**

```ts
import type {LlmConfig} from '@/agent-core/llm-api/index.js';
import {settingsService} from '@/services/settings/index.js';

/** Returns the LLM configuration for chat sessions from settings. */
export async function getLlmConfig(): Promise<LlmConfig> {
  const settings = await settingsService.getAll();
  const {apiFormat, apiKey, baseUrl, model, thinkingLevel} = settings.llm;
  return {apiFormat, apiKey, baseUrl, model, thinkingLevel};
}
```

- [ ] **Step 3: Create `chat-agent-session/chat-agent-session-service.ts`**

```ts
import type {SessionMetadata} from '@omnicraft/api-schema';
import type {SseEventCursorEntry} from '@omnicraft/sse-events';

import {MainAgent} from '@/agent/agents/index.js';
import type {AgentSseLogReaderOptions} from '@/agent-core/agent/index.js';
import {MainAgentStore} from '@/models/agent-store/index.js';

import {getLlmConfig} from './helpers.js';
import type {CreateSessionResult} from './types.js';
import {CreateSessionError} from './types.js';

/** Service layer for chat-agent sessions. */
export const chatAgentSessionService = {
  /**
   * Creates a new chat session.
   * Validates LLM configuration before creating the session.
   */
  async createSession(): Promise<CreateSessionResult> {
    const llmConfig = await getLlmConfig();

    if (!llmConfig.baseUrl) {
      return {
        success: false,
        error: CreateSessionError.BASE_URL_NOT_CONFIGURED,
      };
    }
    if (!llmConfig.model) {
      return {success: false, error: CreateSessionError.MODEL_NOT_CONFIGURED};
    }

    const store = MainAgentStore.getInstance();
    const agent = new MainAgent(undefined, store.sessionsDir);
    return {success: true, sessionId: agent.id};
  },

  /**
   * Sends a user message to the agent. The agent runs in the background;
   * use {@link subscribe} to read events. Returns false if agent not found.
   */
  async sendCompletion(agentId: string, userMessage: string): Promise<boolean> {
    const agent = await MainAgentStore.getInstance().get(agentId);
    if (!agent) return false;
    agent.enqueueUserTurn(userMessage);
    return true;
  },

  /**
   * Returns an async iterable of SSE events with resume cursors for the agent.
   * Returns undefined if agent not found.
   */
  async subscribe(
    agentId: string,
    options?: AgentSseLogReaderOptions,
  ): Promise<AsyncIterable<SseEventCursorEntry> | undefined> {
    const agent = await MainAgentStore.getInstance().get(agentId);
    if (!agent) return undefined;
    return agent.subscribe(options);
  },

  /** Aborts the currently running turn. Returns false if agent not found. */
  async abortCompletion(agentId: string): Promise<boolean> {
    const agent = await MainAgentStore.getInstance().get(agentId);
    if (!agent) return false;
    agent.abort();
    return true;
  },

  /**
   * Delivers a user response to a waiting client-side tool.
   * Returns false if the agent or interaction does not exist.
   */
  async submitToolResponse(
    agentId: string,
    interactionId: string,
    result: unknown,
  ): Promise<boolean> {
    const agent = await MainAgentStore.getInstance().get(agentId);
    if (!agent) return false;
    return agent.submitUserResponse(interactionId, result);
  },

  /** Lists persisted sessions with pagination. */
  async listSessions(
    offset: number,
    limit: number,
  ): Promise<{sessions: SessionMetadata[]; total: number}> {
    return MainAgentStore.getInstance().listSessionMetadata(offset, limit);
  },

  /** Deletes a session. Returns false if session not found. */
  async deleteSession(agentId: string): Promise<boolean> {
    const store = MainAgentStore.getInstance();
    if (!(await store.has(agentId))) return false;
    await store.delete(agentId);
    return true;
  },
};
```

- [ ] **Step 4: Create `chat-agent-session/index.ts`**

```ts
export {chatAgentSessionService} from './chat-agent-session-service.js';
```

- [ ] **Step 5: Create `coding-agent-session/types.ts`**

```ts
/** Reasons why coding session creation can fail. */
export enum CreateSessionError {
  BASE_URL_NOT_CONFIGURED = 'BASE_URL_NOT_CONFIGURED',
  MODEL_NOT_CONFIGURED = 'MODEL_NOT_CONFIGURED',
  WORKSPACE_PATH_NOT_FOUND = 'WORKSPACE_PATH_NOT_FOUND',
  WORKSPACE_PATH_NOT_DIRECTORY = 'WORKSPACE_PATH_NOT_DIRECTORY',
  WORKSPACE_PATH_NOT_ACCESSIBLE = 'WORKSPACE_PATH_NOT_ACCESSIBLE',
  WORKSPACE_NOT_CONFIGURED = 'WORKSPACE_NOT_CONFIGURED',
}

/** Result of createSession: either success with sessionId, or failure with error. */
export type CreateSessionResult =
  | {success: true; sessionId: string}
  | {success: false; error: CreateSessionError};
```

- [ ] **Step 6: Create `coding-agent-session/helpers.ts`**

```ts
import type {LlmConfig} from '@/agent-core/llm-api/index.js';
import {settingsService} from '@/services/settings/index.js';

/** Returns the LLM configuration for coding sessions from settings. */
export async function getLlmConfig(): Promise<LlmConfig> {
  const settings = await settingsService.getAll();
  const {apiFormat, apiKey, baseUrl, model, thinkingLevel} = settings.codingLlm;
  return {apiFormat, apiKey, baseUrl, model, thinkingLevel};
}
```

- [ ] **Step 7: Create `coding-agent-session/validation.ts`** (ported verbatim from `services/agent-session/validation.ts`)

```ts
import {constants} from 'node:fs';

import type {Workspace} from '@omnicraft/settings-schema';

import {checkDirectoryAccess} from '@/helpers/fs.js';

import {CreateSessionError} from './types.js';

/**
 * Validates workspace against settings and filesystem.
 * Returns null if valid, or the error found.
 */
export async function validateSessionPaths(
  workspace: string,
  workspaces: readonly Workspace[],
): Promise<CreateSessionError | null> {
  const entry = workspaces.find((w) => w.path === workspace);
  if (!entry) return CreateSessionError.WORKSPACE_NOT_CONFIGURED;

  const fsError = await checkDirectoryAccess(
    workspace,
    constants.R_OK | constants.W_OK,
  );
  if (fsError === 'not_found') {
    return CreateSessionError.WORKSPACE_PATH_NOT_FOUND;
  }
  if (fsError === 'not_directory') {
    return CreateSessionError.WORKSPACE_PATH_NOT_DIRECTORY;
  }
  if (fsError === 'not_accessible') {
    return CreateSessionError.WORKSPACE_PATH_NOT_ACCESSIBLE;
  }

  return null;
}
```

- [ ] **Step 8: Create `coding-agent-session/validation.test.ts`**

Copy the existing test file `apps/backend/src/services/agent-session/validation.test.ts` verbatim into the new location (its imports are relative — `./validation.js`, `./types.js` — so they resolve unchanged). First read the source to copy it exactly:

Run: `cat apps/backend/src/services/agent-session/validation.test.ts`
Then write the identical content to `apps/backend/src/services/coding-agent-session/validation.test.ts`.

- [ ] **Step 9: Create `coding-agent-session/coding-agent-session-service.ts`**

```ts
import type {SessionMetadata} from '@omnicraft/api-schema';
import type {SseEventCursorEntry} from '@omnicraft/sse-events';

import {CodingAgent} from '@/agent/agents/index.js';
import type {AgentSseLogReaderOptions} from '@/agent-core/agent/index.js';
import {CodingAgentStore} from '@/models/agent-store/index.js';
import {SettingsManager} from '@/models/settings-manager/index.js';

import {getLlmConfig} from './helpers.js';
import type {CreateSessionResult} from './types.js';
import {CreateSessionError} from './types.js';
import {validateSessionPaths} from './validation.js';

/** Service layer for coding-agent sessions. */
export const codingAgentSessionService = {
  /**
   * Creates a new coding session.
   * Validates LLM configuration and the workspace before creating the session.
   */
  async createSession(workspace: string): Promise<CreateSessionResult> {
    const llmConfig = await getLlmConfig();

    if (!llmConfig.baseUrl) {
      return {
        success: false,
        error: CreateSessionError.BASE_URL_NOT_CONFIGURED,
      };
    }
    if (!llmConfig.model) {
      return {success: false, error: CreateSessionError.MODEL_NOT_CONFIGURED};
    }

    const settings = await SettingsManager.getInstance().getAll();
    const validationError = await validateSessionPaths(
      workspace,
      settings.fileAccess.workspaces,
    );
    if (validationError) {
      return {success: false, error: validationError};
    }

    const store = CodingAgentStore.getInstance();
    const agent = new CodingAgent(workspace, store.sessionsDir);
    return {success: true, sessionId: agent.id};
  },

  /**
   * Sends a user message to the agent. The agent runs in the background;
   * use {@link subscribe} to read events. Returns false if agent not found.
   */
  async sendCompletion(agentId: string, userMessage: string): Promise<boolean> {
    const agent = await CodingAgentStore.getInstance().get(agentId);
    if (!agent) return false;
    agent.enqueueUserTurn(userMessage);
    return true;
  },

  /**
   * Returns an async iterable of SSE events with resume cursors for the agent.
   * Returns undefined if agent not found.
   */
  async subscribe(
    agentId: string,
    options?: AgentSseLogReaderOptions,
  ): Promise<AsyncIterable<SseEventCursorEntry> | undefined> {
    const agent = await CodingAgentStore.getInstance().get(agentId);
    if (!agent) return undefined;
    return agent.subscribe(options);
  },

  /** Aborts the currently running turn. Returns false if agent not found. */
  async abortCompletion(agentId: string): Promise<boolean> {
    const agent = await CodingAgentStore.getInstance().get(agentId);
    if (!agent) return false;
    agent.abort();
    return true;
  },

  /**
   * Delivers a user response to a waiting client-side tool.
   * Returns false if the agent or interaction does not exist.
   */
  async submitToolResponse(
    agentId: string,
    interactionId: string,
    result: unknown,
  ): Promise<boolean> {
    const agent = await CodingAgentStore.getInstance().get(agentId);
    if (!agent) return false;
    return agent.submitUserResponse(interactionId, result);
  },

  /** Lists persisted sessions with pagination. */
  async listSessions(
    offset: number,
    limit: number,
  ): Promise<{sessions: SessionMetadata[]; total: number}> {
    return CodingAgentStore.getInstance().listSessionMetadata(offset, limit);
  },

  /** Deletes a session. Returns false if session not found. */
  async deleteSession(agentId: string): Promise<boolean> {
    const store = CodingAgentStore.getInstance();
    if (!(await store.has(agentId))) return false;
    await store.delete(agentId);
    return true;
  },
};
```

- [ ] **Step 10: Create `coding-agent-session/index.ts`**

```ts
export {codingAgentSessionService} from './coding-agent-session-service.js';
```

- [ ] **Step 11: Typecheck**

Run: `bun run --filter '@omnicraft/backend' typecheck`
Expected: PASS (new services compile; old service still present and used).

- [ ] **Step 12: Run backend tests**

Run: `bun run --filter '@omnicraft/backend' test`
Expected: PASS, including the new `coding-agent-session/validation.test.ts` and the still-present `agent-session/validation.test.ts`.

- [ ] **Step 13: Commit**

```bash
git add apps/backend/src/services/chat-agent-session apps/backend/src/services/coding-agent-session
git commit -m "refactor(backend): add forked chat/coding session services

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Backend — shared dispatcher helpers + forked routers (additive, not mounted)

Create the shared transport helpers and both new routers. Not mounted yet, so they are temporarily unused and the build stays green.

**Files:**

- Create: `apps/backend/src/dispatcher/helpers/cursor.ts`
- Create: `apps/backend/src/dispatcher/helpers/cursor.test.ts`
- Create: `apps/backend/src/dispatcher/helpers/sse.ts`
- Create: `apps/backend/src/dispatcher/helpers/sse.test.ts`
- Create: `apps/backend/src/dispatcher/chat-agent-session/path.ts`
- Create: `apps/backend/src/dispatcher/chat-agent-session/router.ts`
- Create: `apps/backend/src/dispatcher/chat-agent-session/index.ts`
- Create: `apps/backend/src/dispatcher/coding-agent-session/path.ts`
- Create: `apps/backend/src/dispatcher/coding-agent-session/router.ts`
- Create: `apps/backend/src/dispatcher/coding-agent-session/index.ts`

**Interfaces:**

- Consumes: `chatAgentSessionService` / `codingAgentSessionService` from Task 1; schemas from `@omnicraft/api-schema`.
- Produces: `parseSseResumeCursor(value: unknown): number`, `writeSseEvent(stream: PassThrough, data: unknown, nextIndex: number): void`, `pumpSseEvents(stream: PassThrough, eventStream: AsyncIterable<SseEventCursorEntry>, req: IncomingMessage, abortController: AbortController): Promise<void>` from `dispatcher/helpers/`; a Koa `router` from each new dispatcher `index.ts`.

- [ ] **Step 1: Create `dispatcher/helpers/cursor.ts`** (verbatim move)

```ts
const CANONICAL_CURSOR_PATTERN = /^(0|[1-9]\d*)$/;

export function parseSseResumeCursor(value: unknown): number {
  if (value === undefined) return 0;

  if (typeof value !== 'string' || !CANONICAL_CURSOR_PATTERN.test(value)) {
    throw new Error('Invalid SSE resume cursor');
  }

  const cursor = Number(value);
  if (!Number.isSafeInteger(cursor)) {
    throw new Error('Invalid SSE resume cursor');
  }

  return cursor;
}
```

- [ ] **Step 2: Create `dispatcher/helpers/cursor.test.ts`**

Copy `apps/backend/src/dispatcher/agent-session/helpers/cursor.test.ts` verbatim (relative import `./cursor.js` resolves unchanged):

Run: `cat apps/backend/src/dispatcher/agent-session/helpers/cursor.test.ts`
Then write the identical content to `apps/backend/src/dispatcher/helpers/cursor.test.ts`.

- [ ] **Step 3: Create `dispatcher/helpers/sse.ts`** (writeSseEvent moved verbatim; `pumpSseEvents` relocated here from the old router)

```ts
import assert from 'node:assert';
import type {IncomingMessage} from 'node:http';
import {PassThrough} from 'node:stream';

import type {SseEventCursorEntry} from '@omnicraft/sse-events';
import {sseEventCursorEntrySchema} from '@omnicraft/sse-events';

/**
 * Writes a single SSE event to the stream. Validates against the shared schema.
 *
 * The SSE `id` field is the backend-authoritative resume cursor: the next raw,
 * uncompressed AgentSseLog index the client should pass as `from` if it
 * reconnects after receiving this event. Replay compression can merge multiple
 * raw log entries into one emitted SSE message, so this cursor can jump by more
 * than one.
 */
export function writeSseEvent(
  stream: PassThrough,
  data: unknown,
  nextIndex: number,
): void {
  if (stream.destroyed || stream.writableEnded) return;
  const result = sseEventCursorEntrySchema.safeParse({
    event: data,
    nextIndex,
  });
  assert(
    result.success,
    `Invalid SSE cursor entry: ${JSON.stringify({event: data, nextIndex})}`,
  );
  stream.write(`id: ${result.data.nextIndex.toString()}\n`);
  stream.write(`data: ${JSON.stringify(result.data.event)}\n\n`);
}

/**
 * Pumps events from an async iterable to a PassThrough SSE stream.
 * Runs in the background — must not be awaited inside a Koa handler,
 * otherwise Koa's respond() never fires and the client receives nothing.
 */
export async function pumpSseEvents(
  stream: PassThrough,
  eventStream: AsyncIterable<SseEventCursorEntry>,
  req: IncomingMessage,
  abortController: AbortController,
): Promise<void> {
  const onDisconnect = () => {
    req.off('close', onDisconnect);
    abortController.abort();
    if (!stream.destroyed) {
      stream.end();
    }
  };
  req.on('close', onDisconnect);

  try {
    for await (const entry of eventStream) {
      writeSseEvent(stream, entry.event, entry.nextIndex);
    }
  } finally {
    req.off('close', onDisconnect);
    if (!stream.destroyed) {
      stream.end();
    }
  }
}
```

- [ ] **Step 4: Create `dispatcher/helpers/sse.test.ts`**

Copy `apps/backend/src/dispatcher/agent-session/helpers/sse.test.ts` verbatim (relative import `./sse.js` resolves unchanged):

Run: `cat apps/backend/src/dispatcher/agent-session/helpers/sse.test.ts`
Then write the identical content to `apps/backend/src/dispatcher/helpers/sse.test.ts`.

- [ ] **Step 5: Create `dispatcher/chat-agent-session/path.ts`**

```ts
export const SESSIONS = '/chat/sessions';
export const SESSION = '/chat/session';
export const SESSION_BY_ID = '/chat/session/:id';
export const SESSION_COMPLETIONS = '/chat/session/:id/completions';
export const SESSION_TOOL_RESPONSE = '/chat/session/:id/tool-response';
export const SESSION_EVENTS = '/chat/session/:id/events';
export const SESSION_ABORT = '/chat/session/:id/abort';
```

- [ ] **Step 6: Create `dispatcher/chat-agent-session/router.ts`**

```ts
import {PassThrough} from 'node:stream';

import Router from '@koa/router';
import {
  chatCompletionsRequestSchema,
  createSessionRequestSchema,
  listSessionsQuerySchema,
  submitToolResponseRequestSchema,
} from '@omnicraft/api-schema';
import {StatusCodes} from 'http-status-codes';
import {ZodError} from 'zod';

import {chatAgentSessionService} from '@/services/chat-agent-session/index.js';

import {parseSseResumeCursor} from '../helpers/cursor.js';
import {pumpSseEvents} from '../helpers/sse.js';
import {
  SESSION,
  SESSION_ABORT,
  SESSION_BY_ID,
  SESSION_COMPLETIONS,
  SESSION_EVENTS,
  SESSION_TOOL_RESPONSE,
  SESSIONS,
} from './path.js';

const router = new Router();

/** GET /chat/sessions — lists persisted sessions with pagination. */
router.get(SESSIONS, async (ctx) => {
  let offset: number;
  let limit: number;
  try {
    const query = listSessionsQuerySchema.parse(ctx.query);
    offset = query.offset;
    limit = query.limit;
  } catch (e) {
    if (e instanceof ZodError) {
      ctx.response.status = StatusCodes.BAD_REQUEST;
      ctx.response.body = {error: e.issues};
      return;
    }
    throw e;
  }

  const result = await chatAgentSessionService.listSessions(offset, limit);
  ctx.response.status = StatusCodes.OK;
  ctx.response.body = result;
});

/** POST /chat/session — creates a new session. */
router.post(SESSION, async (ctx) => {
  try {
    createSessionRequestSchema.parse(ctx.request.body);
  } catch (e) {
    if (e instanceof ZodError) {
      ctx.response.status = StatusCodes.BAD_REQUEST;
      ctx.response.body = {error: e.issues};
      return;
    }
    throw e;
  }

  const result = await chatAgentSessionService.createSession();
  if (!result.success) {
    ctx.response.status = StatusCodes.UNPROCESSABLE_ENTITY;
    ctx.response.body = {error: result.error};
    return;
  }

  ctx.response.status = StatusCodes.CREATED;
  ctx.response.body = {sessionId: result.sessionId};
});

/** POST /chat/session/:id/completions — starts a completion in the background. */
router.post(SESSION_COMPLETIONS, async (ctx) => {
  const {id} = ctx.params;

  let message: string;
  try {
    const body = chatCompletionsRequestSchema.parse(ctx.request.body);
    message = body.message;
  } catch (e) {
    if (e instanceof ZodError) {
      ctx.response.status = StatusCodes.BAD_REQUEST;
      ctx.response.body = {error: e.issues};
      return;
    }
    throw e;
  }

  const found = await chatAgentSessionService.sendCompletion(id, message);
  if (!found) {
    ctx.response.status = StatusCodes.NOT_FOUND;
    ctx.response.body = {error: `Session not found: ${id}`};
    return;
  }

  ctx.response.status = StatusCodes.ACCEPTED;
});

/** GET /chat/session/:id/events — SSE stream of agent events. */
router.get(SESSION_EVENTS, async (ctx) => {
  const {id} = ctx.params;

  let from: number;
  try {
    from = parseSseResumeCursor(ctx.query.from);
  } catch (e) {
    ctx.response.status = StatusCodes.BAD_REQUEST;
    ctx.response.body = {
      error: e instanceof Error ? e.message : 'Invalid SSE resume cursor',
    };
    return;
  }

  const abortController = new AbortController();
  const eventStream = await chatAgentSessionService.subscribe(id, {
    startIndex: from,
    signal: abortController.signal,
  });
  if (!eventStream) {
    ctx.response.status = StatusCodes.NOT_FOUND;
    ctx.response.body = {error: `Session not found: ${id}`};
    return;
  }

  ctx.response.type = 'text/event-stream';
  ctx.response.set('Cache-Control', 'no-cache');
  ctx.response.set('Connection', 'keep-alive');
  ctx.response.set('X-Accel-Buffering', 'no');

  const stream = new PassThrough();
  ctx.body = stream;

  void pumpSseEvents(stream, eventStream, ctx.req, abortController);
});

/** POST /chat/session/:id/abort — aborts the running agent turn. */
router.post(SESSION_ABORT, async (ctx) => {
  const {id} = ctx.params;

  const found = await chatAgentSessionService.abortCompletion(id);
  if (!found) {
    ctx.response.status = StatusCodes.NOT_FOUND;
    ctx.response.body = {error: `Session not found: ${id}`};
    return;
  }

  ctx.response.status = StatusCodes.NO_CONTENT;
});

/** POST /chat/session/:id/tool-response — submits a user response for a client-side tool. */
router.post(SESSION_TOOL_RESPONSE, async (ctx) => {
  const {id} = ctx.params;

  let interactionId: string;
  let result: unknown;
  try {
    const body = submitToolResponseRequestSchema.parse(ctx.request.body);
    interactionId = body.interactionId;
    result = body.result;
  } catch (e) {
    if (e instanceof ZodError) {
      ctx.response.status = StatusCodes.BAD_REQUEST;
      ctx.response.body = {error: e.issues};
      return;
    }
    throw e;
  }

  const found = await chatAgentSessionService.submitToolResponse(
    id,
    interactionId,
    result,
  );
  if (!found) {
    ctx.response.status = StatusCodes.NOT_FOUND;
    ctx.response.body = {error: `Session or interaction not found`};
    return;
  }

  ctx.response.status = StatusCodes.NO_CONTENT;
});

/** DELETE /chat/session/:id — deletes a session from memory and disk. */
router.delete(SESSION_BY_ID, async (ctx) => {
  const {id} = ctx.params;

  const found = await chatAgentSessionService.deleteSession(id);
  if (!found) {
    ctx.response.status = StatusCodes.NOT_FOUND;
    ctx.response.body = {error: `Session not found: ${id}`};
    return;
  }

  ctx.response.status = StatusCodes.NO_CONTENT;
});

export {router};
```

- [ ] **Step 7: Create `dispatcher/chat-agent-session/index.ts`**

```ts
export {router} from './router.js';
```

- [ ] **Step 8: Create `dispatcher/coding-agent-session/path.ts`**

```ts
export const SESSIONS = '/coding/sessions';
export const SESSION = '/coding/session';
export const SESSION_BY_ID = '/coding/session/:id';
export const SESSION_COMPLETIONS = '/coding/session/:id/completions';
export const SESSION_TOOL_RESPONSE = '/coding/session/:id/tool-response';
export const SESSION_EVENTS = '/coding/session/:id/events';
export const SESSION_ABORT = '/coding/session/:id/abort';
```

- [ ] **Step 9: Create `dispatcher/coding-agent-session/router.ts`**

Identical structure to the chat router, with three differences: it imports `codingAgentSessionService`, the create handler parses `createCodingSessionRequestSchema` and passes `workspace` to `createSession`.

```ts
import {PassThrough} from 'node:stream';

import Router from '@koa/router';
import {
  chatCompletionsRequestSchema,
  createCodingSessionRequestSchema,
  listSessionsQuerySchema,
  submitToolResponseRequestSchema,
} from '@omnicraft/api-schema';
import {StatusCodes} from 'http-status-codes';
import {ZodError} from 'zod';

import {codingAgentSessionService} from '@/services/coding-agent-session/index.js';

import {parseSseResumeCursor} from '../helpers/cursor.js';
import {pumpSseEvents} from '../helpers/sse.js';
import {
  SESSION,
  SESSION_ABORT,
  SESSION_BY_ID,
  SESSION_COMPLETIONS,
  SESSION_EVENTS,
  SESSION_TOOL_RESPONSE,
  SESSIONS,
} from './path.js';

const router = new Router();

/** GET /coding/sessions — lists persisted sessions with pagination. */
router.get(SESSIONS, async (ctx) => {
  let offset: number;
  let limit: number;
  try {
    const query = listSessionsQuerySchema.parse(ctx.query);
    offset = query.offset;
    limit = query.limit;
  } catch (e) {
    if (e instanceof ZodError) {
      ctx.response.status = StatusCodes.BAD_REQUEST;
      ctx.response.body = {error: e.issues};
      return;
    }
    throw e;
  }

  const result = await codingAgentSessionService.listSessions(offset, limit);
  ctx.response.status = StatusCodes.OK;
  ctx.response.body = result;
});

/** POST /coding/session — creates a new session. */
router.post(SESSION, async (ctx) => {
  let workspace: string;
  try {
    const body = createCodingSessionRequestSchema.parse(ctx.request.body);
    workspace = body.workspace;
  } catch (e) {
    if (e instanceof ZodError) {
      ctx.response.status = StatusCodes.BAD_REQUEST;
      ctx.response.body = {error: e.issues};
      return;
    }
    throw e;
  }

  const result = await codingAgentSessionService.createSession(workspace);
  if (!result.success) {
    ctx.response.status = StatusCodes.UNPROCESSABLE_ENTITY;
    ctx.response.body = {error: result.error};
    return;
  }

  ctx.response.status = StatusCodes.CREATED;
  ctx.response.body = {sessionId: result.sessionId};
});

/** POST /coding/session/:id/completions — starts a completion in the background. */
router.post(SESSION_COMPLETIONS, async (ctx) => {
  const {id} = ctx.params;

  let message: string;
  try {
    const body = chatCompletionsRequestSchema.parse(ctx.request.body);
    message = body.message;
  } catch (e) {
    if (e instanceof ZodError) {
      ctx.response.status = StatusCodes.BAD_REQUEST;
      ctx.response.body = {error: e.issues};
      return;
    }
    throw e;
  }

  const found = await codingAgentSessionService.sendCompletion(id, message);
  if (!found) {
    ctx.response.status = StatusCodes.NOT_FOUND;
    ctx.response.body = {error: `Session not found: ${id}`};
    return;
  }

  ctx.response.status = StatusCodes.ACCEPTED;
});

/** GET /coding/session/:id/events — SSE stream of agent events. */
router.get(SESSION_EVENTS, async (ctx) => {
  const {id} = ctx.params;

  let from: number;
  try {
    from = parseSseResumeCursor(ctx.query.from);
  } catch (e) {
    ctx.response.status = StatusCodes.BAD_REQUEST;
    ctx.response.body = {
      error: e instanceof Error ? e.message : 'Invalid SSE resume cursor',
    };
    return;
  }

  const abortController = new AbortController();
  const eventStream = await codingAgentSessionService.subscribe(id, {
    startIndex: from,
    signal: abortController.signal,
  });
  if (!eventStream) {
    ctx.response.status = StatusCodes.NOT_FOUND;
    ctx.response.body = {error: `Session not found: ${id}`};
    return;
  }

  ctx.response.type = 'text/event-stream';
  ctx.response.set('Cache-Control', 'no-cache');
  ctx.response.set('Connection', 'keep-alive');
  ctx.response.set('X-Accel-Buffering', 'no');

  const stream = new PassThrough();
  ctx.body = stream;

  void pumpSseEvents(stream, eventStream, ctx.req, abortController);
});

/** POST /coding/session/:id/abort — aborts the running agent turn. */
router.post(SESSION_ABORT, async (ctx) => {
  const {id} = ctx.params;

  const found = await codingAgentSessionService.abortCompletion(id);
  if (!found) {
    ctx.response.status = StatusCodes.NOT_FOUND;
    ctx.response.body = {error: `Session not found: ${id}`};
    return;
  }

  ctx.response.status = StatusCodes.NO_CONTENT;
});

/** POST /coding/session/:id/tool-response — submits a user response for a client-side tool. */
router.post(SESSION_TOOL_RESPONSE, async (ctx) => {
  const {id} = ctx.params;

  let interactionId: string;
  let result: unknown;
  try {
    const body = submitToolResponseRequestSchema.parse(ctx.request.body);
    interactionId = body.interactionId;
    result = body.result;
  } catch (e) {
    if (e instanceof ZodError) {
      ctx.response.status = StatusCodes.BAD_REQUEST;
      ctx.response.body = {error: e.issues};
      return;
    }
    throw e;
  }

  const found = await codingAgentSessionService.submitToolResponse(
    id,
    interactionId,
    result,
  );
  if (!found) {
    ctx.response.status = StatusCodes.NOT_FOUND;
    ctx.response.body = {error: `Session or interaction not found`};
    return;
  }

  ctx.response.status = StatusCodes.NO_CONTENT;
});

/** DELETE /coding/session/:id — deletes a session from memory and disk. */
router.delete(SESSION_BY_ID, async (ctx) => {
  const {id} = ctx.params;

  const found = await codingAgentSessionService.deleteSession(id);
  if (!found) {
    ctx.response.status = StatusCodes.NOT_FOUND;
    ctx.response.body = {error: `Session not found: ${id}`};
    return;
  }

  ctx.response.status = StatusCodes.NO_CONTENT;
});

export {router};
```

- [ ] **Step 10: Create `dispatcher/coding-agent-session/index.ts`**

```ts
export {router} from './router.js';
```

- [ ] **Step 11: Typecheck**

Run: `bun run --filter '@omnicraft/backend' typecheck`
Expected: PASS (new routers compile; still unused; old dispatcher untouched).

- [ ] **Step 12: Run backend tests**

Run: `bun run --filter '@omnicraft/backend' test`
Expected: PASS, including the moved `dispatcher/helpers/cursor.test.ts` and `dispatcher/helpers/sse.test.ts` (and the still-present originals under `agent-session/helpers/`).

- [ ] **Step 13: Commit**

```bash
git add apps/backend/src/dispatcher/helpers apps/backend/src/dispatcher/chat-agent-session apps/backend/src/dispatcher/coding-agent-session
git commit -m "refactor(backend): add shared dispatcher helpers and forked chat/coding routers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Backend — swap mounts and delete the old coupled chain

Switch the API router to the two new routers and remove the old `agent-session` dispatcher and service. This is the atomic cut-over; after it, the old folders are gone and the `agentType` parameter no longer exists in the backend.

**Files:**

- Modify: `apps/backend/src/dispatcher/index.ts`
- Delete: `apps/backend/src/dispatcher/agent-session/` (entire folder)
- Delete: `apps/backend/src/services/agent-session/` (entire folder)

**Interfaces:**

- Consumes: the routers from `dispatcher/chat-agent-session/index.js` and `dispatcher/coding-agent-session/index.js` (Task 2).

- [ ] **Step 1: Rewrite `dispatcher/index.ts`**

```ts
import Router from '@koa/router';
import compose from 'koa-compose';

import {router as chatAgentSessionRouter} from './chat-agent-session/index.js';
import {router as codingAgentSessionRouter} from './coding-agent-session/index.js';
import {router as fileAccessSettingsRouter} from './file-access-settings/index.js';
import {router as healthRouter} from './health/index.js';
import {router as settingsRouter} from './settings/index.js';
import {router as vscodeRouter} from './vscode/index.js';

const apiRouter = new Router({prefix: '/api'});

apiRouter.use(async (ctx, next) => {
  await next();
  ctx.set('Cache-Control', 'no-store');
});

apiRouter.use(
  chatAgentSessionRouter.routes(),
  chatAgentSessionRouter.allowedMethods(),
);
apiRouter.use(
  codingAgentSessionRouter.routes(),
  codingAgentSessionRouter.allowedMethods(),
);
apiRouter.use(
  fileAccessSettingsRouter.routes(),
  fileAccessSettingsRouter.allowedMethods(),
);
apiRouter.use(healthRouter.routes(), healthRouter.allowedMethods());
apiRouter.use(settingsRouter.routes(), settingsRouter.allowedMethods());
apiRouter.use(vscodeRouter.routes(), vscodeRouter.allowedMethods());

export function dispatcher() {
  return compose([apiRouter.routes(), apiRouter.allowedMethods()]);
}
```

- [ ] **Step 2: Delete the old folders**

Run:

```bash
git rm -r apps/backend/src/dispatcher/agent-session apps/backend/src/services/agent-session
```

- [ ] **Step 3: Grep for stale references**

Run: `grep -rn "agent-session\|agentSessionService\|parseAgentType\|AgentType" apps/backend/src --include="*.ts" | grep -v "subAgentType\|SubAgentType"`
Expected: only matches inside `chat-agent-session/` and `coding-agent-session/` folder _names_ (paths), and NO occurrence of `AgentType`, `agentSessionService`, or `parseAgentType` as identifiers. If any identifier remains, fix it before continuing.

- [ ] **Step 4: Typecheck**

Run: `bun run --filter '@omnicraft/backend' typecheck`
Expected: PASS.

- [ ] **Step 5: Lint + run backend tests**

Run: `bun run --filter '@omnicraft/backend' lint && bun run --filter '@omnicraft/backend' test`
Expected: PASS. (The duplicate validation/cursor/sse tests are now single copies again, under the new locations.)

- [ ] **Step 6: Sanity-check the routes are mounted**

Run: `grep -rn "'/chat/\|'/coding/" apps/backend/src/dispatcher/chat-agent-session/path.ts apps/backend/src/dispatcher/coding-agent-session/path.ts`
Expected: chat path.ts shows `/chat/...`, coding path.ts shows `/coding/...` — identical URL surface to the pre-refactor `/:agentType/...`.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/dispatcher/index.ts
git commit -m "refactor(backend): mount forked routers and remove coupled agent-session chain

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Frontend — fork the api chain, share the cursor helper

Inline the shared `api/agent-session` logic into the two existing per-type facades, relocate `parseCursor` to the shared `api/helpers/sse.ts`, fix the one type import, and delete the shared module.

**Files:**

- Modify: `apps/frontend/src/api/helpers/sse.ts`
- Modify: `apps/frontend/src/api/helpers/sse.test.ts`
- Modify: `apps/frontend/src/api/chat/chat.ts`
- Modify: `apps/frontend/src/api/coding/coding.ts`
- Modify: `apps/frontend/src/modules/chat-session/contexts/ChatSessionApiContext/ChatSessionApiContext.ts`
- Delete: `apps/frontend/src/api/agent-session/` (entire folder)

**Interfaces:**

- Produces: `parseCursor(id: string | null): number` exported from `api/helpers/sse.js`; each facade exposes `createSession`, `sendMessage`, `subscribeEvents`, `abortCompletion`, `submitToolResponse`, `listSessions`, `deleteSession` with the same signatures as today (minus the `agentType` argument), satisfying the `ChatSessionApi` interface structurally.

- [ ] **Step 1: Write the failing test for the relocated `parseCursor`**

Append to `apps/frontend/src/api/helpers/sse.test.ts` (add the `parseCursor` import to the existing import from `./sse.js`):

```ts
import {parseCursor} from './sse.js';

describe('parseCursor', () => {
  it('parses a canonical non-negative integer id', () => {
    expect(parseCursor('0')).toBe(0);
    expect(parseCursor('42')).toBe(42);
  });

  it('throws when the id is missing', () => {
    expect(() => parseCursor(null)).toThrow('missing resume cursor');
  });

  it('throws on a non-canonical id', () => {
    expect(() => parseCursor('01')).toThrow('Invalid SSE resume cursor id');
    expect(() => parseCursor('-1')).toThrow('Invalid SSE resume cursor id');
    expect(() => parseCursor('1.5')).toThrow('Invalid SSE resume cursor id');
  });
});
```

(If `describe`/`it`/`expect` are not yet imported in this file, add `import {describe, expect, it} from 'vitest';` — check the file head first with `head -5 apps/frontend/src/api/helpers/sse.test.ts`.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run --filter '@omnicraft/frontend' test -- sse.test.ts`
Expected: FAIL — `parseCursor` is not exported from `./sse.js`.

- [ ] **Step 3: Add `parseCursor` to `api/helpers/sse.ts`**

Append at the end of `apps/frontend/src/api/helpers/sse.ts`:

```ts
/**
 * Parses an SSE event `id` field into a numeric resume cursor.
 * Throws if the id is missing or is not a canonical non-negative integer.
 */
export function parseCursor(id: string | null): number {
  if (id === null) {
    throw new Error('SSE event is missing resume cursor id');
  }

  if (!/^(0|[1-9]\d*)$/.test(id)) {
    throw new Error(`Invalid SSE resume cursor id: ${id}`);
  }

  const cursor = Number(id);
  if (!Number.isSafeInteger(cursor)) {
    throw new Error(`Invalid SSE resume cursor id: ${id}`);
  }

  return cursor;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run --filter '@omnicraft/frontend' test -- sse.test.ts`
Expected: PASS.

- [ ] **Step 5: Rewrite `api/chat/chat.ts` to be self-contained**

```ts
import {
  createSessionResponseSchema,
  type ListSessionsResponse,
  listSessionsResponseSchema,
} from '@omnicraft/api-schema';
import {
  type SseEventCursorEntry,
  sseEventCursorEntrySchema,
} from '@omnicraft/sse-events';

import {HttpError} from '../helpers/http-error.js';
import {parseCursor, parseSseStream} from '../helpers/sse.js';

const BASE = '/api/chat';

export interface CreateSessionOptions {
  workspace?: string;
}

/** Creates a new chat session. Returns the session ID. */
export async function createSession(
  options: CreateSessionOptions,
): Promise<string> {
  const res = await fetch(`${BASE}/session`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(options),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Failed to create session (${res.status.toString()}): ${body}`,
    );
  }

  const json: unknown = await res.json();
  const {sessionId} = createSessionResponseSchema.parse(json);
  return sessionId;
}

/**
 * Sends a message to a chat session. The agent processes it in the background.
 * Use {@link subscribeEvents} to receive events.
 */
export async function sendMessage(
  sessionId: string,
  message: string,
): Promise<void> {
  const res = await fetch(`${BASE}/session/${sessionId}/completions`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({message}),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Request failed (${res.status.toString()}): ${body}`);
  }
}

/**
 * Subscribes to SSE events from a chat session.
 * Replays from {@link from} index, then tails live events.
 */
export async function* subscribeEvents(
  sessionId: string,
  from: number,
  signal?: AbortSignal,
): AsyncGenerator<SseEventCursorEntry, void, undefined> {
  const url = `${BASE}/session/${sessionId}/events?from=${from.toString()}`;
  const res = await fetch(url, {signal});

  if (!res.ok) {
    const body = await res.text();
    throw new HttpError(
      res.status,
      `Event subscription failed (${res.status.toString()}): ${body}`,
    );
  }

  for await (const {id, data} of parseSseStream(res)) {
    const parsed: unknown = JSON.parse(data);
    yield sseEventCursorEntrySchema.parse({
      event: parsed,
      nextIndex: parseCursor(id),
    });
  }
}

/** Aborts the currently running agent turn. */
export async function abortCompletion(sessionId: string): Promise<void> {
  const res = await fetch(`${BASE}/session/${sessionId}/abort`, {
    method: 'POST',
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Failed to abort completion (${res.status.toString()}): ${body}`,
    );
  }
}

/**
 * Submits a user response for a client-side tool interaction.
 *
 * The `result` is untyped — callers must construct it according to the
 * tool-specific response schema.
 */
export async function submitToolResponse(
  sessionId: string,
  interactionId: string,
  result: unknown,
): Promise<void> {
  const res = await fetch(`${BASE}/session/${sessionId}/tool-response`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({interactionId, result}),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Failed to submit tool response (${res.status.toString()}): ${body}`,
    );
  }
}

/** Fetches the list of past chat sessions. */
export async function listSessions(
  offset: number,
  limit: number,
): Promise<ListSessionsResponse> {
  const params = new URLSearchParams({
    offset: offset.toString(),
    limit: limit.toString(),
  });
  const res = await fetch(`${BASE}/sessions?${params.toString()}`);

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Failed to list sessions (${res.status.toString()}): ${body}`,
    );
  }

  const json: unknown = await res.json();
  return listSessionsResponseSchema.parse(json);
}

/** Deletes a chat session by ID. */
export async function deleteSession(id: string): Promise<void> {
  const res = await fetch(`${BASE}/session/${id}`, {
    method: 'DELETE',
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Failed to delete session (${res.status.toString()}): ${body}`,
    );
  }
}
```

- [ ] **Step 6: Rewrite `api/coding/coding.ts`** (identical to chat.ts except `const BASE = '/api/coding';` and the doc-comments say "coding")

Use the exact same file content as Step 5, with these two textual changes only:

- `const BASE = '/api/chat';` → `const BASE = '/api/coding';`
- In the four doc-comments, replace "chat session" / "chat sessions" with "coding session" / "coding sessions" (createSession, sendMessage, subscribeEvents, listSessions).

- [ ] **Step 7: Inline `CreateSessionOptions` into `ChatSessionApiContext.ts`**

Replace the import of `CreateSessionOptions` from the (to-be-deleted) shared module with a local definition:

```ts
import type {ListSessionsResponse} from '@omnicraft/api-schema';
import type {SseEventCursorEntry} from '@omnicraft/sse-events';
import {createContext} from 'react';

/** Options accepted when creating a session through the injected API. */
export interface CreateSessionOptions {
  workspace?: string;
}

export interface ChatSessionApi {
  createSession: (options: CreateSessionOptions) => Promise<string>;

  sendMessage: (sessionId: string, message: string) => Promise<void>;

  subscribeEvents: (
    sessionId: string,
    from: number,
    signal?: AbortSignal,
  ) => AsyncGenerator<SseEventCursorEntry, void, undefined>;

  abortCompletion: (sessionId: string) => Promise<void>;

  submitToolResponse: (
    sessionId: string,
    interactionId: string,
    result: unknown,
  ) => Promise<void>;

  listSessions: (
    offset: number,
    limit: number,
  ) => Promise<ListSessionsResponse>;

  deleteSession: (id: string) => Promise<void>;
}

export const ChatSessionApiContext = createContext<ChatSessionApi | null>(null);
```

- [ ] **Step 8: Delete the shared frontend module**

Run: `git rm -r apps/frontend/src/api/agent-session`

- [ ] **Step 9: Grep for stale references**

Run: `grep -rn "api/agent-session\|agentSessionApi" apps/frontend/src --include="*.ts*"`
Expected: no matches.

- [ ] **Step 10: Typecheck (build), lint, and run frontend tests**

Run: `bun run --filter '@omnicraft/frontend' build && bun run --filter '@omnicraft/frontend' lint && bun run --filter '@omnicraft/frontend' test`
Expected: PASS. `ChatPage.test.tsx` / `CodingPage.test.tsx` mock `@/api/chat` / `@/api/coding` and are unaffected.

- [ ] **Step 11: Commit**

```bash
git add apps/frontend/src/api apps/frontend/src/modules/chat-session/contexts/ChatSessionApiContext/ChatSessionApiContext.ts
git commit -m "refactor(frontend): fork chat/coding api chains, share cursor parser

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Docs + full verification

Update the dispatcher CLAUDE.md to mention the shared helpers folder, then run the whole verification suite and the browser smoke check.

**Files:**

- Modify: `apps/backend/src/dispatcher/CLAUDE.md`

- [ ] **Step 1: Note the shared helpers folder in `dispatcher/CLAUDE.md`**

Under the "## Conventions" section, add a bullet:

```markdown
- Agent-agnostic transport helpers shared across resource modules live in
  `dispatcher/helpers/` (e.g. SSE cursor parsing and event pumping), not inside
  any single resource folder.
```

- [ ] **Step 2: Repo-wide typecheck**

Run: `bun run typecheck:all`
Expected: PASS.

- [ ] **Step 3: Repo-wide lint + format check**

Run: `bun run lint:all && bun run format:check`
Expected: PASS. (If `format:check` flags files, run `bun run format` and amend.)

- [ ] **Step 4: Run all tests (backend + frontend)**

Run: `bun run --filter '@omnicraft/backend' test && bun run --filter '@omnicraft/frontend' test`
Expected: PASS.

- [ ] **Step 5: Browser smoke check (both themes)**

Start the dev server from the repo root: `bun dev`. In a browser:

- Open the **chat** page: create a session, send a message, confirm streamed events render, confirm the session appears in the history list, then delete it.
- Open the **coding** page: create a session against a configured workspace, send a message, confirm streamed events render, abort a turn, then delete the session.
- Repeat a quick pass in both light and dark themes.
  Expected: identical behavior to before the refactor; network calls go to `/api/chat/...` and `/api/coding/...`.

- [ ] **Step 6: Commit docs**

```bash
git add apps/backend/src/dispatcher/CLAUDE.md
git commit -m "docs(backend): note shared dispatcher transport helpers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-review

**Spec coverage:**

- Backend dispatcher split → Tasks 2 & 3. ✓
- Backend service split (incl. coding-only `validation.ts` + workspace error variants, per-type `getLlmConfig`) → Task 1. ✓
- Shared backend SSE transport in `dispatcher/helpers/` incl. relocated `pumpSseEvents` → Task 2. ✓
- `validator.ts`/`parseAgentType` deletion + literal paths → Tasks 2 (literal paths) & 3 (deletion via folder removal); grep gate in Task 3 Step 3. ✓
- `dispatcher/index.ts` mounts both routers → Task 3. ✓
- `AgentType` gone from backend chains → Task 3 Step 3 grep gate. ✓
- Frontend api fork + shared `parseCursor` + `ChatSessionApiContext` type fix + delete shared module → Task 4. ✓
- Schema, `agent-core`, `chat-session` UI left shared → reflected by absence of tasks touching them; no step imports/edits them. ✓
- Verification (typecheck/test/lint/format + browser both themes) → Task 5. ✓

**Placeholder scan:** No TBD/TODO/"handle errors". Two steps say "copy verbatim, read the source first" (Task 1 Step 8, Task 2 Steps 2 & 4) — these are exact-copy moves of existing files whose full content is large; the `cat`-then-write instruction is precise and deterministic, not a placeholder. Task 4 Step 6 specifies the two exact textual diffs from Step 5's full code.

**Type consistency:** Service method names match across producer (Tasks 1) and consumer (Task 2 routers): `createSession` (chat: no arg; coding: `workspace`), `sendCompletion(agentId, message)`, `subscribe(agentId, options)`, `abortCompletion(agentId)`, `submitToolResponse(agentId, interactionId, result)`, `listSessions(offset, limit)`, `deleteSession(agentId)`. Helper names match across files: `parseSseResumeCursor`, `writeSseEvent`, `pumpSseEvents` (backend); `parseCursor`, `parseSseStream`, `HttpError` (frontend). `CreateSessionResult`/`CreateSessionError` are defined per-chain and consumed only within their own chain. `CreateSessionOptions` is defined in each frontend facade and in `ChatSessionApiContext`, structurally identical (`{workspace?: string}`).
