# Session-Scoped Thinking Level Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move thinking level from each completion request to immutable session creation config for Chat and Coding sessions.

**Architecture:** The backend `Agent` stores one session thinking level, persists it in snapshots, and uses it for every turn. Completion requests carry only message text. The frontend keeps draft thinking level in creation surfaces and renders created-session level passively from `done.usage.thinkingLevel`.

**Tech Stack:** Bun monorepo, TypeScript, Koa, Zod, React 19, Vite, Vitest, HeroUI.

---

## File Map

- `packages/api-schema/src/chat/schema.ts`: add Chat creation request schema, add thinking level to Coding creation, remove thinking level from completions.
- `packages/api-schema/src/index.ts`: export the new Chat creation request schema/type.
- `packages/sse-events/src/schema.ts`: add `thinkingLevel` to `SseUsage`.
- `apps/backend/src/agent-core/agent/types.ts`: require `thinkingLevel` in persisted agent snapshot options and agent options.
- `apps/backend/src/agent-core/agent/agent.ts`: store session thinking level, remove `handleUserMessage` thinking-level parameter, include thinking level in usage.
- `apps/backend/src/agent/agents/main-agent/main-agent.ts`: accept thinking level for new sessions and restore from snapshot.
- `apps/backend/src/agent/agents/coding-agent/coding-agent.ts`: accept thinking level for new sessions and restore from snapshot.
- `apps/backend/src/agent/agents/general-sub-agent/general-sub-agent.ts`: accept subagent task thinking level as constructor config.
- `apps/backend/src/agent/agents/explore-sub-agent/explore-sub-agent.ts`: accept subagent task thinking level as constructor config.
- `apps/backend/src/agent/agents/coding-sub-agent/coding-sub-agent.ts`: pass a fixed thinking level into the base agent options.
- `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts`: pass explicit subagent thinking level at subagent construction and call `handleUserMessage(task)`.
- `apps/backend/src/dispatcher/agent-session/router.ts`: parse thinking level at session creation and message only at completion.
- `apps/backend/src/services/agent-session/agent-session-service.ts`: carry thinking level in create options and remove it from send completion.
- `apps/frontend/src/api/agent-session/agent-session.ts`: send thinking level only in session creation requests.
- `apps/frontend/src/api/chat/chat.ts`: require thinking level in Chat session creation and remove it from send message.
- `apps/frontend/src/api/coding/coding.ts`: require thinking level in Coding session creation and remove it from send message.
- `apps/frontend/src/modules/chat-session/contexts/ChatSessionApiContext/ChatSessionApiContext.ts`: update frontend API function types.
- `apps/frontend/src/modules/chat-session/contexts/SessionIdContext/SessionIdContext.ts`: require session creation config.
- `apps/frontend/src/modules/chat-session/contexts/SessionIdContext/SessionIdProvider.tsx`: pass required config through to `createSession`.
- `apps/frontend/src/modules/chat-session/hooks/useStreamChat.ts`: create sessions from per-call creation config and send completion messages without thinking level.
- `apps/frontend/src/modules/chat-session/components/ChatInput/*`: make this the existing-session composer without a thinking selector.
- `apps/frontend/src/modules/chat-session/components/ChatSessionStarterInput/*`: create a no-session Chat composer with a thinking selector.
- `apps/frontend/src/modules/chat-session/components/ThinkingLevelSelect/constants.ts`: share thinking-level labels.
- `apps/frontend/src/modules/chat-session/components/ThinkingLevelSelect/index.ts`: export shared labels.
- `apps/frontend/src/modules/chat-session/components/UsageInfo/*`: render `usage.thinkingLevel` with the usage metadata.
- `apps/frontend/src/pages/chat/ChatPage.tsx`: use starter composer for `/chat` and plain composer for `/chat/:sessionId`.
- `apps/frontend/src/pages/chat/ChatPageView.tsx`: render the correct composer mode.
- `apps/frontend/src/pages/coding/CodingPage.tsx`: pass Coding creation config on initial task and send follow-ups without thinking level.
- `apps/frontend/src/pages/coding/CodingPageView.tsx`: update callback types and follow-up composer props.
- Tests listed in each task below.

---

### Task 1: Shared Contracts and Backend Session State

**Files:**

- Modify: `packages/api-schema/src/chat/schema.ts`
- Modify: `packages/api-schema/src/index.ts`
- Modify: `packages/sse-events/src/schema.ts`
- Modify: `apps/backend/src/agent-core/agent/types.ts`
- Modify: `apps/backend/src/agent-core/agent/agent.ts`
- Modify: `apps/backend/src/agent/agents/main-agent/main-agent.ts`
- Modify: `apps/backend/src/agent/agents/coding-agent/coding-agent.ts`
- Modify: `apps/backend/src/agent/agents/general-sub-agent/general-sub-agent.ts`
- Modify: `apps/backend/src/agent/agents/explore-sub-agent/explore-sub-agent.ts`
- Modify: `apps/backend/src/agent/agents/coding-sub-agent/coding-sub-agent.ts`
- Modify: `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts`
- Modify: `apps/backend/src/agent-core/agent/persistence/agent-persistence.test.ts`
- Modify: `apps/backend/src/agent-core/agent/agent.test.ts`

- [ ] **Step 1: Update backend tests first**

In `apps/backend/src/agent-core/agent/persistence/agent-persistence.test.ts`, change `createTestSnapshot` so snapshot options include thinking level:

```typescript
function createTestSnapshot(id: string): AgentSnapshot {
  return {
    id,
    title: 'Test Session',
    sseEventCount: 0,
    llmSession: {
      id: 'llm-session-id',
      messages: [],
    },
    options: {
      workingDirectory: '/tmp/test-working-dir',
      thinkingLevel: 'medium',
    },
  };
}
```

Add this validation test inside `describe('loadSnapshot', ...)`:

```typescript
it('throws when snapshot options are missing thinkingLevel', async () => {
  const filePath = path.join(tmpDir, agentId, 'snapshot.json');
  await writeFile(
    filePath,
    JSON.stringify({
      id: agentId,
      title: 'Test Session',
      sseEventCount: 0,
      llmSession: {id: 'llm-session-id', messages: []},
      options: {workingDirectory: '/tmp/test-working-dir'},
    }),
  );

  await expect(
    agentPersistence.loadSnapshot(tmpDir, agentId),
  ).rejects.toThrow();
});
```

In `apps/backend/src/agent-core/agent/agent.test.ts`, update the test agent construction and call site:

```typescript
const agent = new TestAgent(() => Promise.resolve(MAIN_CONFIG), {
  toolRegistries: [],
  skillRegistries: [],
  baseSystemPrompt: '',
  getMaxToolRounds: () => 1,
  getLightConfig: () => Promise.resolve(LIGHT_CONFIG),
  thinkingLevel: 'high',
});

const eventsPromise = collectUntilDone(agent);
agent.handleUserMessage('Please help me rename a component');
const events = await eventsPromise;
```

Add assertions in the same test after `doneIndex` is computed:

```typescript
expect(events[doneIndex]).toMatchObject({
  type: 'done',
  usage: {thinkingLevel: 'high'},
});
```

- [ ] **Step 2: Run tests to verify failures**

Run:

```bash
bun run --filter '@omnicraft/backend' test -- src/agent-core/agent/persistence/agent-persistence.test.ts src/agent-core/agent/agent.test.ts
```

Expected: FAIL because `AgentSnapshot.options.thinkingLevel`, `AgentOptions.thinkingLevel`, and `SseUsage.thinkingLevel` are not implemented yet, and `handleUserMessage` still expects a thinking-level argument.

- [ ] **Step 3: Update shared API schemas**

In `packages/api-schema/src/chat/schema.ts`, replace the session/completion schemas with this shape:

```typescript
/** Schema for the POST /chat/session request body. */
export const createSessionRequestSchema = z.object({
  thinkingLevel: thinkingLevelSchema,
});

export type CreateSessionRequest = z.infer<typeof createSessionRequestSchema>;

/** Schema for the POST /coding/session request body. */
export const createCodingSessionRequestSchema = z.object({
  workspace: z.string(),
  thinkingLevel: thinkingLevelSchema,
});

export type CreateCodingSessionRequest = z.infer<
  typeof createCodingSessionRequestSchema
>;

/** Schema for the POST /chat/session response body. */
export const createSessionResponseSchema = z.object({
  sessionId: z.string(),
});

export type CreateSessionResponse = z.infer<typeof createSessionResponseSchema>;

/** Schema for the POST /chat/session/:id/completions request body. */
export const chatCompletionsRequestSchema = z.object({
  message: z.string().min(1),
});

export type ChatCompletionsRequest = z.infer<
  typeof chatCompletionsRequestSchema
>;
```

In `packages/api-schema/src/index.ts`, export the new symbols:

```typescript
  type CreateSessionRequest,
  createSessionRequestSchema,
```

Place them next to the existing `CreateSessionResponse` exports.

In `packages/sse-events/src/schema.ts`, update `sseUsageSchema`:

```typescript
/** Token usage statistics shared between backend and frontend. */
export const sseUsageSchema = z.object({
  model: z.string(),
  maxInputTokens: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheReadInputTokens: z.number(),
  thinkingLevel: thinkingLevelSchema,
});
```

- [ ] **Step 4: Update Agent snapshot and options types**

In `apps/backend/src/agent-core/agent/types.ts`, import the shared schema/type and add required thinking level to snapshot options:

```typescript
import {thinkingLevelSchema, type ThinkingLevel} from '@omnicraft/api-schema';
```

```typescript
const agentSnapshotOptionsSchema = z.object({
  workingDirectory: z.string().optional(),
  thinkingLevel: thinkingLevelSchema,
  claudeCodeSessionId: z.string().optional(),
});
```

Update `AgentOptions`:

```typescript
export interface AgentOptions {
  readonly toolRegistries: ToolRegistry[];
  readonly skillRegistries: SkillRegistry[];
  readonly baseSystemPrompt: string;
  readonly getMaxToolRounds: () => Promise<number> | number;
  readonly thinkingLevel: ThinkingLevel;
  readonly getLightConfig?: () => Promise<LlmConfig>;
  readonly workingDirectory?: string;
  readonly sessionsDir?: string;
}
```

- [ ] **Step 5: Store thinking level in Agent**

In `apps/backend/src/agent-core/agent/agent.ts`, add a private field near the other constructor-owned fields:

```typescript
private readonly thinkingLevel: ThinkingLevel;
```

Set it in the constructor after `this.getLightConfig` is assigned:

```typescript
this.thinkingLevel = snapshot?.options.thinkingLevel ?? options.thinkingLevel;
```

Update `toSnapshot()` options:

```typescript
options: {
  workingDirectory: this.workingDirectory,
  thinkingLevel: this.thinkingLevel,
},
```

Change public turn entrypoint:

```typescript
handleUserMessage(userMessage: string): void {
  void this.runTurn(userMessage);
}
```

Change `runTurn` signature and capture the session level for the turn:

```typescript
private async runTurn(userMessage: string): Promise<void> {
  const release = await this.mutex.acquire();
  try {
    const thinkingLevel = this.thinkingLevel;
    this.abortController = new AbortController();
    const stream = this.runAgentLoop(
      userMessage,
      thinkingLevel,
      this.abortController.signal,
    );
```

Update `buildSseUsage()` return value:

```typescript
return {
  model: config.model,
  maxInputTokens,
  thinkingLevel: this.thinkingLevel,
  ...this.llmSession.getUsage(),
};
```

- [ ] **Step 6: Update concrete agents and subagents**

In `apps/backend/src/agent/agents/main-agent/main-agent.ts`, import the type and update the constructor:

```typescript
import type {ThinkingLevel} from '@omnicraft/api-schema';
```

```typescript
constructor(
  workingDirectory: string | undefined,
  thinkingLevel: ThinkingLevel,
  sessionsDir?: string,
  snapshot?: AgentSnapshot,
) {
```

Add `thinkingLevel` to the `super` options object:

```typescript
thinkingLevel,
workingDirectory,
sessionsDir,
```

Update restore:

```typescript
return new MainAgent(
  snapshot.options.workingDirectory,
  snapshot.options.thinkingLevel,
  sessionsDir,
  snapshot,
);
```

Apply the same constructor, option, and restore pattern to `apps/backend/src/agent/agents/coding-agent/coding-agent.ts`.

In `apps/backend/src/agent/agents/general-sub-agent/general-sub-agent.ts`, import `ThinkingLevel`, change the constructor, and pass the level into `super`:

```typescript
constructor(
  getConfig: () => Promise<LlmConfig>,
  workingDirectory: string,
  thinkingLevel: ThinkingLevel,
) {
```

```typescript
thinkingLevel,
workingDirectory,
```

Apply the same constructor pattern to `apps/backend/src/agent/agents/explore-sub-agent/explore-sub-agent.ts`.

In `apps/backend/src/agent/agents/coding-sub-agent/coding-sub-agent.ts`, set the base option to the snapshot value when present and `none` for new instances:

```typescript
thinkingLevel: snapshot?.options.thinkingLevel ?? 'none',
workingDirectory,
```

Keep `runAgentLoop` ignoring the argument because Claude Agent SDK execution does not consume this setting.

- [ ] **Step 7: Update subagent dispatch construction**

In `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts`, update `createSubAgent`:

```typescript
export function createSubAgent(
  agentType: SubAgentType,
  getConfig: () => Promise<LlmConfig>,
  workingDirectory: string,
  thinkingLevel: z.infer<typeof thinkingLevelSchema>,
): Agent {
  switch (agentType) {
    case SUB_AGENT_TYPE.GENERAL:
      return new GeneralSubAgent(getConfig, workingDirectory, thinkingLevel);
    case SUB_AGENT_TYPE.EXPLORE:
      return new ExploreSubAgent(getConfig, workingDirectory, thinkingLevel);
  }
}
```

Update the call site:

```typescript
const subagent = createSubAgent(
  agentType,
  getConfig,
  workingDirectory,
  thinkingLevel,
);
```

Update the start call:

```typescript
subagent.handleUserMessage(task);
```

- [ ] **Step 8: Run backend-focused tests**

Run:

```bash
bun run --filter '@omnicraft/backend' test -- src/agent-core/agent/persistence/agent-persistence.test.ts src/agent-core/agent/agent.test.ts
```

Expected: PASS.

- [ ] **Step 9: Run backend typecheck**

Run:

```bash
bun run --filter '@omnicraft/backend' typecheck
```

Expected: FAIL at this point only in route/service call sites that still pass thinking level per message. Those are fixed in Task 2. If other backend type errors appear, fix them before continuing.

---

### Task 2: Backend Session API Flow

**Files:**

- Modify: `apps/backend/src/dispatcher/agent-session/router.ts`
- Modify: `apps/backend/src/services/agent-session/agent-session-service.ts`
- Modify: `apps/backend/src/agent/agents/main-agent/main-agent.ts`
- Modify: `apps/backend/src/agent/agents/coding-agent/coding-agent.ts`

- [ ] **Step 1: Update service tests through Agent tests and typecheck target**

The backend has no focused `agent-session-service` test for construction options. Use `typecheck` plus the existing agent tests from Task 1 as the regression target for this task.

Run before editing:

```bash
bun run --filter '@omnicraft/backend' typecheck
```

Expected: FAIL where router/service code still uses per-message `thinkingLevel` or constructs `MainAgent`/`CodingAgent` without thinking level.

- [ ] **Step 2: Update agent session service**

In `apps/backend/src/services/agent-session/agent-session-service.ts`, keep the `ThinkingLevel` import and update `CreateSessionOptions`:

```typescript
interface CreateSessionOptions {
  thinkingLevel: ThinkingLevel;
  workspace?: string;
}
```

Update agent construction:

```typescript
case AgentType.CHAT:
  agent = new MainAgent(
    options.workspace,
    options.thinkingLevel,
    sessionsDir,
  );
  break;
case AgentType.CODING:
  agent = new CodingAgent(
    options.workspace,
    options.thinkingLevel,
    sessionsDir,
  );
  break;
```

Update `sendCompletion` signature and body:

```typescript
async sendCompletion(
  agentType: AgentType,
  agentId: string,
  userMessage: string,
): Promise<boolean> {
  const agent = await getStore(agentType).get(agentId);
  if (!agent) return false;
  agent.handleUserMessage(userMessage);
  return true;
},
```

- [ ] **Step 3: Update HTTP route parsing**

In `apps/backend/src/dispatcher/agent-session/router.ts`, replace the import list so it includes `createSessionRequestSchema` and keeps `ThinkingLevel` only for session creation options:

```typescript
import {
  AgentType,
  chatCompletionsRequestSchema,
  createCodingSessionRequestSchema,
  createSessionRequestSchema,
  listSessionsQuerySchema,
  submitToolResponseRequestSchema,
  type ThinkingLevel,
} from '@omnicraft/api-schema';
```

Replace session creation body parsing:

```typescript
let options: {thinkingLevel: ThinkingLevel; workspace?: string};
try {
  switch (agentType) {
    case AgentType.CHAT: {
      const body = createSessionRequestSchema.parse(ctx.request.body);
      options = {thinkingLevel: body.thinkingLevel};
      break;
    }
    case AgentType.CODING: {
      const body = createCodingSessionRequestSchema.parse(ctx.request.body);
      options = {
        workspace: body.workspace,
        thinkingLevel: body.thinkingLevel,
      };
      break;
    }
  }
```

Replace completion parsing:

```typescript
let message: string;
try {
  const body = chatCompletionsRequestSchema.parse(ctx.request.body);
  message = body.message;
} catch (e) {
```

Update the service call:

```typescript
const found = await agentSessionService.sendCompletion(agentType, id, message);
```

- [ ] **Step 4: Run backend typecheck and tests**

Run:

```bash
bun run --filter '@omnicraft/backend' typecheck
bun run --filter '@omnicraft/backend' test -- src/agent-core/agent/persistence/agent-persistence.test.ts src/agent-core/agent/agent.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit backend contract changes**

Run:

```bash
git add packages/api-schema/src/chat/schema.ts packages/api-schema/src/index.ts packages/sse-events/src/schema.ts apps/backend/src/agent-core/agent/types.ts apps/backend/src/agent-core/agent/agent.ts apps/backend/src/agent/agents/main-agent/main-agent.ts apps/backend/src/agent/agents/coding-agent/coding-agent.ts apps/backend/src/agent/agents/general-sub-agent/general-sub-agent.ts apps/backend/src/agent/agents/explore-sub-agent/explore-sub-agent.ts apps/backend/src/agent/agents/coding-sub-agent/coding-sub-agent.ts apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts apps/backend/src/dispatcher/agent-session/router.ts apps/backend/src/services/agent-session/agent-session-service.ts apps/backend/src/agent-core/agent/persistence/agent-persistence.test.ts apps/backend/src/agent-core/agent/agent.test.ts
git commit -m "feat: store thinking level on agent sessions"
```

---

### Task 3: Frontend API and Stream Hook Contract

**Files:**

- Modify: `apps/frontend/src/api/agent-session/agent-session.ts`
- Modify: `apps/frontend/src/api/chat/chat.ts`
- Modify: `apps/frontend/src/api/coding/coding.ts`
- Modify: `apps/frontend/src/modules/chat-session/contexts/ChatSessionApiContext/ChatSessionApiContext.ts`
- Modify: `apps/frontend/src/modules/chat-session/contexts/SessionIdContext/SessionIdContext.ts`
- Modify: `apps/frontend/src/modules/chat-session/contexts/SessionIdContext/SessionIdProvider.tsx`
- Modify: `apps/frontend/src/modules/chat-session/hooks/useStreamChat.ts`
- Modify: `apps/frontend/src/modules/chat-session/hooks/useStreamChat.test.tsx`

- [ ] **Step 1: Update frontend test fixtures for new usage shape**

In `apps/frontend/src/modules/chat-session/hooks/useStreamChat.test.tsx`, update `usage()`:

```typescript
function usage() {
  return {
    model: 'test-model',
    maxInputTokens: 100,
    inputTokens: 10,
    outputTokens: 5,
    cacheReadInputTokens: 0,
    thinkingLevel: 'none' as const,
  };
}
```

Update `createApi` for the new API shape:

```typescript
function createApi(events: readonly SseEvent[]): ChatSessionApi {
  return {
    createSession: vi.fn(() => Promise.resolve('session-1')),
    sendMessage: vi.fn(() => Promise.resolve()),
    subscribeEvents: vi.fn(async function* () {
      await Promise.resolve();
      for (const event of events) {
        yield event;
      }
    }),
    abortCompletion: vi.fn(() => Promise.resolve()),
    submitToolResponse: vi.fn(() => Promise.resolve()),
    listSessions: vi.fn(() => Promise.resolve({sessions: [], total: 0})),
    deleteSession: vi.fn(() => Promise.resolve()),
  };
}
```

The object body is unchanged except that TypeScript will now validate `createSession` accepts config and `sendMessage` accepts only `(sessionId, message)`.

- [ ] **Step 2: Run frontend hook test to verify failures**

Run:

```bash
bun run --filter '@omnicraft/frontend' test -- src/modules/chat-session/hooks/useStreamChat.test.tsx
```

Expected: FAIL because frontend API/context types and `useStreamChat` still use per-message thinking level.

- [ ] **Step 3: Update frontend API wrappers**

In `apps/frontend/src/api/agent-session/agent-session.ts`, update the options and functions:

```typescript
export interface CreateSessionOptions {
  thinkingLevel: ThinkingLevel;
  workspace?: string;
}
```

```typescript
export async function sendMessage(
  agentType: AgentType,
  sessionId: string,
  message: string,
): Promise<void> {
  const res = await fetch(
    `${base(agentType)}/session/${sessionId}/completions`,
    {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({message}),
    },
  );
```

In `apps/frontend/src/api/chat/chat.ts`, update imports and functions:

```typescript
import {AgentType, type ListSessionsResponse} from '@omnicraft/api-schema';
import type {SseEvent} from '@omnicraft/sse-events';

import type {CreateSessionOptions} from '../agent-session/index.js';
import * as agentSessionApi from '../agent-session/index.js';

/** Creates a new chat session. Returns the session ID. */
export async function createSession(
  options: CreateSessionOptions,
): Promise<string> {
  return agentSessionApi.createSession(AgentType.CHAT, options);
}

export async function sendMessage(
  sessionId: string,
  message: string,
): Promise<void> {
  return agentSessionApi.sendMessage(AgentType.CHAT, sessionId, message);
}
```

In `apps/frontend/src/api/coding/coding.ts`, keep `CreateSessionOptions` and update `sendMessage`:

```typescript
export async function sendMessage(
  sessionId: string,
  message: string,
): Promise<void> {
  return agentSessionApi.sendMessage(AgentType.CODING, sessionId, message);
}
```

- [ ] **Step 4: Update frontend context types**

In `apps/frontend/src/modules/chat-session/contexts/ChatSessionApiContext/ChatSessionApiContext.ts`, import `CreateSessionOptions` from the API package and remove `ThinkingLevel`:

```typescript
import type {ListSessionsResponse} from '@omnicraft/api-schema';
import type {SseEvent} from '@omnicraft/sse-events';
import {createContext} from 'react';

import type {CreateSessionOptions} from '@/api/agent-session/index.js';
```

Update the interface:

```typescript
export interface ChatSessionApi {
  createSession: (options: CreateSessionOptions) => Promise<string>;

  sendMessage: (sessionId: string, message: string) => Promise<void>;
```

In `apps/frontend/src/modules/chat-session/contexts/SessionIdContext/SessionIdContext.ts`, import `CreateSessionOptions` and update `createNewSessionId`:

```typescript
import type {CreateSessionOptions} from '@/api/agent-session/index.js';
```

```typescript
createNewSessionId: (config: CreateSessionOptions) => Promise<string | null>;
```

In `SessionIdProvider.tsx`, import the same type and update the callback:

```typescript
const createNewSessionId = useCallback(
  async (config: CreateSessionOptions) => {
    try {
      const id = await createSession(config);
```

- [ ] **Step 5: Update `useStreamChat` session creation flow**

In `apps/frontend/src/modules/chat-session/hooks/useStreamChat.ts`, import the creation options:

```typescript
import type {CreateSessionOptions} from '@/api/agent-session/index.js';
```

Update the callback signature and logic:

```typescript
const sendMessage = useCallback(
  async (content: string, createSessionOptions?: CreateSessionOptions) => {
    if (isStreaming) return;

    const trimmed = content.trim();
    if (!trimmed) return;

    if (sessionId === null && createSessionOptions === undefined) {
      throw new Error('Session creation options are required.');
    }

    const activeSessionId =
      sessionId ?? (await createNewSessionId(createSessionOptions));
    if (!activeSessionId) return;

    setStreamError(null);
    setMaxRoundsReached(false);
    setIsStreaming(true);

    eventBus.emit('user-message-sent', {content: trimmed});

    try {
      await apiSendMessage(activeSessionId, trimmed);
```

TypeScript narrows `createSessionOptions` after the guard. If it does not, assign a local before the call:

```typescript
const config = createSessionOptions;
if (sessionId === null && config === undefined) {
  throw new Error('Session creation options are required.');
}
const activeSessionId = sessionId ?? (await createNewSessionId(config));
```

- [ ] **Step 6: Run frontend hook test and typecheck through build**

Run:

```bash
bun run --filter '@omnicraft/frontend' test -- src/modules/chat-session/hooks/useStreamChat.test.tsx
bun run --filter '@omnicraft/frontend' build
```

Expected: build still FAILS because Chat/Coding page components still pass thinking level as a message argument. Task 4 fixes those call sites. The hook test should PASS after this task.

---

### Task 4: Chat and Coding Creation UI Flow

**Files:**

- Modify: `apps/frontend/src/modules/chat-session/components/ChatInput/ChatInput.tsx`
- Modify: `apps/frontend/src/modules/chat-session/components/ChatInput/ChatInputView.tsx`
- Modify: `apps/frontend/src/modules/chat-session/components/ChatInput/styles.module.css`
- Create: `apps/frontend/src/modules/chat-session/components/ChatSessionStarterInput/index.ts`
- Create: `apps/frontend/src/modules/chat-session/components/ChatSessionStarterInput/ChatSessionStarterInput.tsx`
- Create: `apps/frontend/src/modules/chat-session/components/ChatSessionStarterInput/ChatSessionStarterInputView.tsx`
- Create: `apps/frontend/src/modules/chat-session/components/ChatSessionStarterInput/styles.module.css`
- Modify: `apps/frontend/src/modules/chat-session/index.ts`
- Modify: `apps/frontend/src/pages/chat/ChatPage.tsx`
- Modify: `apps/frontend/src/pages/chat/ChatPageView.tsx`
- Modify: `apps/frontend/src/pages/coding/CodingPage.tsx`
- Modify: `apps/frontend/src/pages/coding/CodingPageView.tsx`
- Modify: `apps/frontend/src/pages/coding/CodingPage.test.tsx`
- Create: `apps/frontend/src/pages/chat/ChatPage.test.tsx`

- [ ] **Step 1: Update Coding page test expectations**

In `apps/frontend/src/pages/coding/CodingPage.test.tsx`, remove the `ThinkingLevel` import. Update the assertions in the existing test:

```typescript
await waitFor(() => {
  expect(mocks.createSession).toHaveBeenCalledWith({
    workspace: '/workspace/repo',
    thinkingLevel: 'none',
  });
});
expect(mocks.sendMessage).toHaveBeenCalledWith(
  'coding-session-1',
  'Implement the requested task.',
);
```

Add this assertion after the chat input appears:

```typescript
expect(screen.queryByLabelText('Thinking level')).not.toBeInTheDocument();
```

- [ ] **Step 2: Add Chat page test for session-scoped creation**

Create `apps/frontend/src/pages/chat/ChatPage.test.tsx`:

```typescript
import type {SseEvent} from '@omnicraft/sse-events';
import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import {MemoryRouter, Route, Routes} from 'react-router';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {ChatPage} from './ChatPage.js';

class ResizeObserverStub implements ResizeObserver {
  disconnect = vi.fn();

  observe = vi.fn();

  unobserve = vi.fn();
}

globalThis.ResizeObserver = ResizeObserverStub;

const mocks = vi.hoisted(() => ({
  abortCompletion: vi.fn(),
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  listSessions: vi.fn(),
  sendMessage: vi.fn(),
  submitToolResponse: vi.fn(),
  subscribeEvents: vi.fn(),
}));

vi.mock('@/api/chat/index.js', () => ({
  abortCompletion: mocks.abortCompletion,
  createSession: mocks.createSession,
  deleteSession: mocks.deleteSession,
  listSessions: mocks.listSessions,
  sendMessage: mocks.sendMessage,
  submitToolResponse: mocks.submitToolResponse,
  subscribeEvents: mocks.subscribeEvents,
}));

vi.mock('@/api/settings/file-access/index.js', () => ({
  getWorkspaces: vi.fn(() => Promise.resolve([])),
}));

async function waitForAbort(signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    signal?.addEventListener(
      'abort',
      () => {
        resolve();
      },
      {once: true},
    );
  });
}

async function* emptyEventStream(
  signal?: AbortSignal,
): AsyncGenerator<SseEvent, void, undefined> {
  yield* [] as SseEvent[];
  await waitForAbort(signal);
  return;
}

function renderChatPage(initialEntry = '/chat') {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path='/chat' element={<ChatPage />} />
        <Route path='/chat/:sessionId' element={<ChatPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ChatPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.abortCompletion.mockResolvedValue(undefined);
    mocks.createSession.mockResolvedValue('chat-session-1');
    mocks.deleteSession.mockResolvedValue(undefined);
    mocks.listSessions.mockResolvedValue({sessions: [], total: 0});
    mocks.sendMessage.mockResolvedValue(undefined);
    mocks.submitToolResponse.mockResolvedValue(undefined);
    mocks.subscribeEvents.mockImplementation(
      (_sessionId: string, _from: number, signal?: AbortSignal) =>
        emptyEventStream(signal),
    );
  });

  it('creates a chat session with default thinking level and sends first message without it', async () => {
    renderChatPage();

    const messageInput = screen.getByLabelText('Chat message');
    expect(screen.getByLabelText('Thinking level')).toBeInTheDocument();
    fireEvent.change(messageInput, {target: {value: '  Hello session.  '}});

    fireEvent.click(screen.getByRole('button', {name: 'Send message'}));

    await waitFor(() => {
      expect(mocks.createSession).toHaveBeenCalledWith({
        thinkingLevel: 'none',
      });
    });
    expect(mocks.sendMessage).toHaveBeenCalledWith(
      'chat-session-1',
      'Hello session.',
    );
  });

  it('hides thinking selector on existing sessions', async () => {
    renderChatPage('/chat/existing-session');

    expect(await screen.findByLabelText('Chat message')).toBeInTheDocument();
    expect(screen.queryByLabelText('Thinking level')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run page tests to verify failures**

Run:

```bash
bun run --filter '@omnicraft/frontend' test -- src/pages/chat/ChatPage.test.tsx src/pages/coding/CodingPage.test.tsx
```

Expected: FAIL because the frontend UI still sends thinking level per message and existing sessions still render the selector.

- [ ] **Step 4: Make `ChatInput` the existing-session composer**

In `apps/frontend/src/modules/chat-session/components/ChatInput/ChatInput.tsx`, remove the `ThinkingLevel` import and `useThinkingLevel` usage. Use this prop shape:

```typescript
interface ChatInputProps {
  isStreaming: boolean;
  onSend: (content: string) => void;
  onStop: () => void;
}
```

Update `handleSend`:

```typescript
const handleSend = useCallback(() => {
  if (!input.trim()) return;
  onSend(input);
  setInput('');
}, [input, onSend]);
```

Update the view props passed from `ChatInput`:

```typescript
<ChatInputView
  input={input}
  isStreaming={isStreaming}
  onInputChange={setInput}
  onKeyDown={handleKeyDown}
  onSend={handleSend}
  onStop={onStop}
/>
```

In `ChatInputView.tsx`, remove `ThinkingLevel`, `ThinkingLevelSelect`, `thinkingLevel`, and `onThinkingLevelChange`. Remove this JSX block:

```typescript
<ThinkingLevelSelect
  value={thinkingLevel}
  isDisabled={isStreaming}
  onChange={onThinkingLevelChange}
/>
```

Keep `styles.container` and `styles.textarea` as they are.

- [ ] **Step 5: Add Chat session starter input**

Create `apps/frontend/src/modules/chat-session/components/ChatSessionStarterInput/index.ts`:

```typescript
export {ChatSessionStarterInput} from './ChatSessionStarterInput.js';
```

Create `ChatSessionStarterInput.tsx`:

```typescript
import type {ThinkingLevel} from '@omnicraft/api-schema';
import {useCallback, useState} from 'react';

import {useThinkingLevel} from '../ThinkingLevelSelect/index.js';
import {ChatSessionStarterInputView} from './ChatSessionStarterInputView.js';

interface ChatSessionStarterInputProps {
  isStreaming: boolean;
  onSend: (content: string, thinkingLevel: ThinkingLevel) => void;
  onStop: () => void;
}

export function ChatSessionStarterInput({
  isStreaming,
  onSend,
  onStop,
}: ChatSessionStarterInputProps) {
  const [input, setInput] = useState('');
  const {thinkingLevel, setThinkingLevel} = useThinkingLevel();

  const handleSend = useCallback(() => {
    if (!input.trim()) return;
    onSend(input, thinkingLevel);
    setInput('');
  }, [input, thinkingLevel, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <ChatSessionStarterInputView
      input={input}
      isStreaming={isStreaming}
      thinkingLevel={thinkingLevel}
      onInputChange={setInput}
      onKeyDown={handleKeyDown}
      onSend={handleSend}
      onStop={onStop}
      onThinkingLevelChange={setThinkingLevel}
    />
  );
}
```

Create `ChatSessionStarterInputView.tsx`:

```typescript
import {Button, TextArea} from '@heroui/react';
import type {ThinkingLevel} from '@omnicraft/api-schema';

import {ThinkingLevelSelect} from '../ThinkingLevelSelect/index.js';
import styles from './styles.module.css';

interface ChatSessionStarterInputViewProps {
  input: string;
  isStreaming: boolean;
  thinkingLevel: ThinkingLevel;
  onInputChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onSend: () => void;
  onStop: () => void;
  onThinkingLevelChange: (level: ThinkingLevel) => void;
}

export function ChatSessionStarterInputView({
  input,
  isStreaming,
  thinkingLevel,
  onInputChange,
  onKeyDown,
  onSend,
  onStop,
  onThinkingLevelChange,
}: ChatSessionStarterInputViewProps) {
  return (
    <div className={styles.container}>
      <TextArea
        aria-label='Chat message'
        className={styles.textarea}
        placeholder='Type a message... (Enter to send, Shift+Enter for newline)'
        rows={1}
        value={input}
        disabled={isStreaming}
        onChange={(e) => {
          onInputChange(e.target.value);
        }}
        onKeyDown={onKeyDown}
      />
      <ThinkingLevelSelect
        value={thinkingLevel}
        isDisabled={isStreaming}
        onChange={onThinkingLevelChange}
      />
      {isStreaming ? (
        <Button aria-label='Stop generation' variant='danger' onPress={onStop}>
          Stop
        </Button>
      ) : (
        <Button
          aria-label='Send message'
          isDisabled={!input.trim()}
          onPress={onSend}
        >
          Send
        </Button>
      )}
    </div>
  );
}
```

Create `styles.module.css`:

```css
.container {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 16px;
}

.textarea {
  flex: 1;
  resize: none;
}
```

Export the component from `apps/frontend/src/modules/chat-session/index.ts`:

```typescript
export {ChatSessionStarterInput} from './components/ChatSessionStarterInput/index.js';
```

- [ ] **Step 6: Update Chat page composition**

In `apps/frontend/src/pages/chat/ChatPage.tsx`, import `ThinkingLevel` if needed and replace the current `onSend` with two handlers:

```typescript
const handleStartSession = useCallback(
  (content: string, thinkingLevel: ThinkingLevel) => {
    void sendMessage(content, {thinkingLevel});
    requestAnimationFrame(() => {
      scrollToBottom();
    });
  },
  [sendMessage, scrollToBottom],
);

const handleSend = useCallback(
  (content: string) => {
    void sendMessage(content);
    requestAnimationFrame(() => {
      scrollToBottom();
    });
  },
  [sendMessage, scrollToBottom],
);
```

Pass both callbacks to `ChatPageView`:

```typescript
onStartSession = {handleStartSession};
onSend = {handleSend};
```

In `apps/frontend/src/pages/chat/ChatPageView.tsx`, update imports and props:

```typescript
  ChatInput,
  ChatSessionStarterInput,
```

```typescript
onStartSession: (content: string, thinkingLevel: ThinkingLevel) => void;
onSend: (content: string) => void;
```

Render the correct composer at the bottom:

```typescript
{sessionId ? (
  <ChatInput isStreaming={isStreaming} onSend={onSend} onStop={onStop} />
) : (
  <ChatSessionStarterInput
    isStreaming={isStreaming}
    onSend={onStartSession}
    onStop={onStop}
  />
)}
```

- [ ] **Step 7: Update Coding page composition**

In `apps/frontend/src/pages/coding/CodingPage.tsx`, keep the `ThinkingLevel` import. Remove `createNewSessionIdWithConfig` and pass `createNewSessionId` directly to `useStreamChat`:

```typescript
const {
  isStreaming,
  isReconnecting,
  streamError,
  maxRoundsReached,
  sendMessage,
  stopGeneration,
  clearStreamError,
  clearMaxRoundsReached,
} = useStreamChat({
  sessionId,
  createNewSessionId,
});
```

Replace `handleSend` with initial task and follow-up handlers:

```typescript
const handleStartTask = useCallback(
  async (content: string, thinkingLevel: ThinkingLevel) => {
    if (selectedWorkspace === undefined) {
      throw new Error('Please select a workspace before starting a session.');
    }
    await sendMessage(content, {
      workspace: selectedWorkspace,
      thinkingLevel,
    });
    requestAnimationFrame(() => {
      scrollToBottom();
    });
  },
  [sendMessage, scrollToBottom, selectedWorkspace],
);

const handleSend = useCallback(
  async (content: string) => {
    await sendMessage(content);
    requestAnimationFrame(() => {
      scrollToBottom();
    });
  },
  [sendMessage, scrollToBottom],
);
```

Pass both to `CodingPageView`:

```typescript
onStartTask = {handleStartTask};
onSend = {handleSend};
```

In `apps/frontend/src/pages/coding/CodingPageView.tsx`, update prop types:

```typescript
onStartTask: (content: string, thinkingLevel: ThinkingLevel) => Promise<void>;
onSend: (content: string) => Promise<void>;
```

Use `onStartTask` for the task card:

```typescript
<TaskDispatchCard onSend={onStartTask} />
```

Use plain content for follow-up ChatInput:

```typescript
<ChatInput
  isStreaming={isStreaming}
  onSend={(content) => {
    void onSend(content);
  }}
  onStop={onStop}
/>
```

- [ ] **Step 8: Run page tests and frontend build**

Run:

```bash
bun run --filter '@omnicraft/frontend' test -- src/pages/chat/ChatPage.test.tsx src/pages/coding/CodingPage.test.tsx src/modules/chat-session/hooks/useStreamChat.test.tsx
bun run --filter '@omnicraft/frontend' build
```

Expected: PASS.

---

### Task 5: UsageInfo Thinking-Level Display

**Files:**

- Create: `apps/frontend/src/modules/chat-session/components/ThinkingLevelSelect/constants.ts`
- Modify: `apps/frontend/src/modules/chat-session/components/ThinkingLevelSelect/ThinkingLevelSelect.tsx`
- Modify: `apps/frontend/src/modules/chat-session/components/ThinkingLevelSelect/index.ts`
- Modify: `apps/frontend/src/modules/chat-session/components/UsageInfo/UsageInfoView.tsx`
- Modify: `apps/frontend/src/modules/chat-session/components/UsageInfo/styles.module.css`
- Create: `apps/frontend/src/modules/chat-session/components/UsageInfo/UsageInfoView.test.tsx`
- Modify: `apps/frontend/src/modules/chat-session/helpers/route-base-event-to-bus.test.ts`

- [ ] **Step 1: Add UsageInfo display test**

Create `apps/frontend/src/modules/chat-session/components/UsageInfo/UsageInfoView.test.tsx`:

```typescript
import {render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';

import {UsageInfoView} from './UsageInfoView.js';

describe('UsageInfoView', () => {
  it('renders thinking level from usage metadata', () => {
    render(
      <UsageInfoView
        usage={{
          model: 'test-model',
          maxInputTokens: 100,
          inputTokens: 20,
          outputTokens: 5,
          cacheReadInputTokens: 10,
          thinkingLevel: 'high',
        }}
      />,
    );

    expect(screen.getByText('Thinking: High')).toBeInTheDocument();
  });
});
```

Export `UsageInfoView` from `apps/frontend/src/modules/chat-session/components/UsageInfo/index.ts` for the test:

```typescript
export {UsageInfo} from './UsageInfo.js';
export {UsageInfoView} from './UsageInfoView.js';
```

- [ ] **Step 2: Run the UsageInfo test to verify failure**

Run:

```bash
bun run --filter '@omnicraft/frontend' test -- src/modules/chat-session/components/UsageInfo/UsageInfoView.test.tsx
```

Expected: FAIL because UsageInfoView does not render thinking level yet.

- [ ] **Step 3: Share thinking-level labels**

Create `apps/frontend/src/modules/chat-session/components/ThinkingLevelSelect/constants.ts`:

```typescript
import type {ThinkingLevel} from '@omnicraft/api-schema';

export const THINKING_LEVEL_LABELS: Record<ThinkingLevel, string> = {
  none: 'None',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra High',
};

export const THINKING_LEVELS = Object.entries(THINKING_LEVEL_LABELS) as [
  ThinkingLevel,
  string,
][];
```

In `ThinkingLevelSelect.tsx`, remove the local constants and import them:

```typescript
import {THINKING_LEVEL_LABELS, THINKING_LEVELS} from './constants.js';
```

In `ThinkingLevelSelect/index.ts`, export the labels:

```typescript
export {THINKING_LEVEL_LABELS, THINKING_LEVELS} from './constants.js';
export {useThinkingLevel} from './hooks/useThinkingLevel.js';
export {ThinkingLevelSelect} from './ThinkingLevelSelect.js';
```

- [ ] **Step 4: Render thinking level in UsageInfo**

In `apps/frontend/src/modules/chat-session/components/UsageInfo/UsageInfoView.tsx`, import labels:

```typescript
import {THINKING_LEVEL_LABELS} from '../ThinkingLevelSelect/index.js';
```

Add this item after the model span:

```typescript
<span className={styles.item}>
  Thinking: {THINKING_LEVEL_LABELS[usage.thinkingLevel]}
</span>
```

The resulting top of the rendered list should be:

```typescript
<div className={clsx(styles.container, className)}>
  <span className={styles.item}>{usage.model}</span>
  <span className={styles.item}>
    Thinking: {THINKING_LEVEL_LABELS[usage.thinkingLevel]}
  </span>
  <span className={`${styles.item} ${isContextHigh ? styles.warning : ''}`}>
```

- [ ] **Step 5: Update remaining frontend usage fixtures**

In `apps/frontend/src/modules/chat-session/helpers/route-base-event-to-bus.test.ts`, add `thinkingLevel: 'none'` to every `usage` object in `done` events:

```typescript
usage: {
  model: 'test-model',
  maxInputTokens: 100,
  inputTokens: 10,
  outputTokens: 5,
  cacheReadInputTokens: 0,
  thinkingLevel: 'none',
},
```

Use `rg -n "usage: \{" apps/frontend/src packages apps/backend/src` to find any remaining `SseUsage` literals missing `thinkingLevel` and update them to the same shape.

- [ ] **Step 6: Run frontend tests and build**

Run:

```bash
bun run --filter '@omnicraft/frontend' test -- src/modules/chat-session/components/UsageInfo/UsageInfoView.test.tsx src/modules/chat-session/helpers/route-base-event-to-bus.test.ts src/modules/chat-session/hooks/useStreamChat.test.tsx src/pages/chat/ChatPage.test.tsx src/pages/coding/CodingPage.test.tsx
bun run --filter '@omnicraft/frontend' build
```

Expected: PASS.

- [ ] **Step 7: Commit frontend changes**

Run:

```bash
git add apps/frontend/src/api/agent-session/agent-session.ts apps/frontend/src/api/chat/chat.ts apps/frontend/src/api/coding/coding.ts apps/frontend/src/modules/chat-session/contexts/ChatSessionApiContext/ChatSessionApiContext.ts apps/frontend/src/modules/chat-session/contexts/SessionIdContext/SessionIdContext.ts apps/frontend/src/modules/chat-session/contexts/SessionIdContext/SessionIdProvider.tsx apps/frontend/src/modules/chat-session/hooks/useStreamChat.ts apps/frontend/src/modules/chat-session/hooks/useStreamChat.test.tsx apps/frontend/src/modules/chat-session/components/ChatInput apps/frontend/src/modules/chat-session/components/ChatSessionStarterInput apps/frontend/src/modules/chat-session/components/ThinkingLevelSelect apps/frontend/src/modules/chat-session/components/UsageInfo apps/frontend/src/modules/chat-session/helpers/route-base-event-to-bus.test.ts apps/frontend/src/modules/chat-session/index.ts apps/frontend/src/pages/chat apps/frontend/src/pages/coding
git commit -m "feat: create sessions with fixed thinking level"
```

---

### Task 6: Final Verification

**Files:**

- Verify only.

- [ ] **Step 1: Run backend verification**

Run:

```bash
bun run --filter '@omnicraft/backend' test
bun run --filter '@omnicraft/backend' typecheck
```

Expected: PASS.

- [ ] **Step 2: Run frontend verification**

Run:

```bash
bun run --filter '@omnicraft/frontend' test
bun run --filter '@omnicraft/frontend' build
```

Expected: PASS.

- [ ] **Step 3: Run package typechecks**

Run:

```bash
bun run --filter '@omnicraft/api-schema' typecheck
bun run --filter '@omnicraft/sse-events' typecheck
```

Expected: PASS.

- [ ] **Step 4: Run repository format check**

Run:

```bash
bun run format:check
```

Expected: PASS.

- [ ] **Step 5: Inspect request payloads manually**

Start the app:

```bash
bun run dev
```

Open the frontend, start a Chat session with `high`, and inspect network payloads:

```text
POST /api/chat/session
body: {"thinkingLevel":"high"}

POST /api/chat/session/00000000-0000-0000-0000-000000000000/completions
body: {"message":"Hello session."}
```

Start a Coding task in `/Users/soulike/.superset/worktrees/omni-craft/fossil-workshop` with `medium`, and inspect network payloads:

```text
POST /api/coding/session
body: {"workspace":"/Users/soulike/.superset/worktrees/omni-craft/fossil-workshop","thinkingLevel":"medium"}

POST /api/coding/session/00000000-0000-0000-0000-000000000000/completions
body: {"message":"Run the test suite."}
```

- [ ] **Step 6: Final commit if verification required formatting changes**

If verification changed files, run:

```bash
git add -A
git commit -m "chore: finish session thinking level verification"
```

If verification did not change files, leave the branch as-is.
