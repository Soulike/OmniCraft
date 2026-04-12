# ask_user Client-Side Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement an `ask_user` client-side tool that lets the LLM present questionnaires with predefined options and custom text input, rendering an interactive form in the chat UI.

**Architecture:** Backend tool uses the existing `UserInteractionBridge` to pause execution and wait for user input. Frontend renders a dedicated `AskUserCard` component (branched at `RenderItem` level) with HeroUI `RadioGroup` for options and `TextField` for custom answers. `callId` is reused as the bridge interaction ID.

**Tech Stack:** TypeScript, Zod, Koa (backend), React 19, HeroUI v3, CSS Modules (frontend)

**Spec:** `docs/specs/2026-04-11-ask-user-tool-design.md`

---

### Task 1: Add ASK_USER to @omnicraft/tool-schemas

**Files:**

- Modify: `packages/tool-schemas/src/tool-name.ts`
- Create: `packages/tool-schemas/src/parameter-schemas.ts`
- Modify: `packages/tool-schemas/src/result-schemas.ts`
- Modify: `packages/tool-schemas/src/registry.ts`
- Modify: `packages/tool-schemas/src/index.ts`

- [ ] **Step 1: Add tool name constant**

In `packages/tool-schemas/src/tool-name.ts`, add `ASK_USER` to the `TOOL_NAME` object and `toolNameSchema`:

```typescript
export const TOOL_NAME = {
  READ_FILE: 'read_file',
  WRITE_FILE: 'write_file',
  EDIT_FILE: 'edit_file',
  FIND_FILES: 'find_files',
  SEARCH_FILES: 'search_files',
  RUN_COMMAND: 'run_command',
  GET_CURRENT_TIME: 'get_current_time',
  WEB_FETCH: 'web_fetch',
  WEB_FETCH_RAW: 'web_fetch_raw',
  WEB_SEARCH: 'web_search',
  LOAD_SKILL: 'load_skill',
  ASK_USER: 'ask_user',
} as const;

export const toolNameSchema = z.enum([
  TOOL_NAME.READ_FILE,
  TOOL_NAME.WRITE_FILE,
  TOOL_NAME.EDIT_FILE,
  TOOL_NAME.FIND_FILES,
  TOOL_NAME.SEARCH_FILES,
  TOOL_NAME.RUN_COMMAND,
  TOOL_NAME.GET_CURRENT_TIME,
  TOOL_NAME.WEB_FETCH,
  TOOL_NAME.WEB_FETCH_RAW,
  TOOL_NAME.WEB_SEARCH,
  TOOL_NAME.LOAD_SKILL,
  TOOL_NAME.ASK_USER,
]);
```

- [ ] **Step 2: Add parameters schema**

Create a new file `packages/tool-schemas/src/parameter-schemas.ts`:

```typescript
import {z} from 'zod';

export const askUserParametersSchema = z.object({
  questions: z
    .array(
      z.object({
        question: z
          .string()
          .describe('The question text to display to the user'),
        options: z
          .array(z.string())
          .describe(
            'Predefined answer options. Empty array for free-text only.',
          ),
      }),
    )
    .describe('One or more questions to present to the user'),
});

export const askUserBridgeResponseSchema = z.discriminatedUnion('cancelled', [
  z.object({
    cancelled: z.literal(false),
    answers: z.array(
      z.object({
        question: z.string(),
        answer: z.string().nullable(),
      }),
    ),
  }),
  z.object({cancelled: z.literal(true)}),
]);
```

- [ ] **Step 3: Add result schema**

In `packages/tool-schemas/src/result-schemas.ts`, add:

```typescript
export const askUserResultSchema = z.object({
  answers: z.array(
    z.object({
      question: z.string(),
      answer: z.string().nullable(),
    }),
  ),
});
```

- [ ] **Step 4: Register in schema registry**

In `packages/tool-schemas/src/registry.ts`:

1. Add import: `askUserResultSchema` to the import from `./result-schemas.js`
2. Add to `toolResultSchemas`: `[TOOL_NAME.ASK_USER]: askUserResultSchema,`
3. Add `askUserResultSchema` to the `toolResultDataSchema` union

- [ ] **Step 5: Export from package index**

In `packages/tool-schemas/src/index.ts`, add `askUserParametersSchema` and `askUserBridgeResponseSchema` to a new named export from `./parameter-schemas.js`, and add `askUserResultSchema` to the existing named exports from `./result-schemas.js`.

- [ ] **Step 6: Verify types compile**

Run: `bun run --filter '@omnicraft/tool-schemas' check`

Expected: No type errors.

- [ ] **Step 7: Commit**

```bash
git add packages/tool-schemas/src/
git commit -m "feat(tool-schemas): add ASK_USER tool name and result schema"
```

---

### Task 2: Add callId to ToolExecutionContext

**Files:**

- Modify: `apps/backend/src/agent-core/tool/types.ts`
- Modify: `apps/backend/src/agent-core/agent/agent.ts`
- Modify: `apps/backend/src/agent-core/tool/testing.ts`

- [ ] **Step 1: Add callId to the interface**

In `apps/backend/src/agent-core/tool/types.ts`, add to `ToolExecutionContext`:

```typescript
export interface ToolExecutionContext {
  /** The unique call ID for this tool invocation, from the LLM API response. */
  readonly callId: string;

  // ... all existing fields unchanged ...
}
```

- [ ] **Step 2: Pass callId in agent.ts executeTool()**

In `apps/backend/src/agent-core/agent/agent.ts`, in the `executeTool` method where `context` is constructed (around line 462), add `callId`:

```typescript
const context: ToolExecutionContext = {
  callId: toolCall.callId,
  availableSkills: this.getAvailableSkills(),
  workingDirectory: this.workingDirectory,
  fileCache: this.fileCache,
  fileStatTracker: this.fileStatTracker,
  extraAllowedPaths: this.extraAllowedPaths,
  shellState: this.shellState,
  signal,
  onSubAgentEvent: (event) => {
    toolSseEventChannel.push(event);
  },
  userInteractionBridge: this.userInteractionBridge,
};
```

- [ ] **Step 3: Update test helper**

In `apps/backend/src/agent-core/tool/testing.ts`, add `callId` to `createMockContext`:

```typescript
export function createMockContext(
  overrides?: Partial<ToolExecutionContext>,
): ToolExecutionContext {
  const workingDirectory = overrides?.workingDirectory ?? os.tmpdir();
  return {
    callId: 'mock-call-id',
    availableSkills: new Map(),
    workingDirectory,
    fileCache: new FileContentCache(),
    fileStatTracker: new FileStatTracker(),
    extraAllowedPaths: [],
    shellState: {cwd: workingDirectory},
    signal: new AbortController().signal,
    onSubAgentEvent: () => {
      // noop — mock context ignores subagent events
    },
    userInteractionBridge: new UserInteractionBridge(),
    ...overrides,
  };
}
```

- [ ] **Step 4: Verify all existing tests still pass**

Run: `bun run --filter 'backend' test`

Expected: All tests pass (callId defaults are compatible).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/agent-core/
git commit -m "feat(agent-core): add callId to ToolExecutionContext"
```

---

### Task 3: Implement ask_user tool and ClientToolRegistry

**Files:**

- Create: `apps/backend/src/agent/tools/client/ask-user.ts`
- Create: `apps/backend/src/agent/tools/client/ask-user.test.ts`
- Create: `apps/backend/src/agent/tools/client/client-tool-registry.ts`
- Create: `apps/backend/src/agent/tools/client/index.ts`
- Modify: `apps/backend/src/agent/tools/index.ts`
- Modify: `apps/backend/src/agent/agents/main-agent/main-agent.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/agent/tools/client/ask-user.test.ts`:

```typescript
import assert from 'node:assert';

import {describe, expect, it} from 'vitest';

import {createMockContext} from '@/agent-core/tool/testing.js';

import {askUserTool} from './ask-user.js';

describe('askUserTool', () => {
  it('has the correct name and description', () => {
    expect(askUserTool.name).toBe('ask_user');
    expect(askUserTool.description).toBeTruthy();
  });

  it('returns success with answers when user submits', async () => {
    const context = createMockContext({callId: 'test-call-1'});

    const executePromise = askUserTool.execute(
      {
        questions: [
          {question: 'What city?', options: ['NYC', 'SF']},
          {question: 'Your name?', options: []},
        ],
      },
      context,
    );

    // Simulate frontend submitting a response
    context.userInteractionBridge.submitResponse('test-call-1', {
      cancelled: false,
      answers: [
        {question: 'What city?', answer: 'SF'},
        {question: 'Your name?', answer: 'Alice'},
      ],
    });

    const result = await executePromise;

    expect(result.status).toBe('success');
    assert(result.status === 'success');
    expect(result.data.answers).toEqual([
      {question: 'What city?', answer: 'SF'},
      {question: 'Your name?', answer: 'Alice'},
    ]);
    expect(result.content).toContain('What city?');
    expect(result.content).toContain('SF');
  });

  it('returns failure when user cancels', async () => {
    const context = createMockContext({callId: 'test-call-2'});

    const executePromise = askUserTool.execute(
      {questions: [{question: 'Favorite color?', options: ['Red', 'Blue']}]},
      context,
    );

    context.userInteractionBridge.submitResponse('test-call-2', {
      cancelled: true,
    });

    const result = await executePromise;

    expect(result.status).toBe('failure');
    assert(result.status === 'failure');
    expect(result.data.message).toContain('declined');
  });

  it('handles unanswered questions (null answer)', async () => {
    const context = createMockContext({callId: 'test-call-3'});

    const executePromise = askUserTool.execute(
      {
        questions: [
          {question: 'Q1?', options: ['A']},
          {question: 'Q2?', options: []},
        ],
      },
      context,
    );

    context.userInteractionBridge.submitResponse('test-call-3', {
      cancelled: false,
      answers: [
        {question: 'Q1?', answer: 'A'},
        {question: 'Q2?', answer: null},
      ],
    });

    const result = await executePromise;

    expect(result.status).toBe('success');
    assert(result.status === 'success');
    expect(result.data.answers[1].answer).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run --filter 'backend' test -- ask-user`

Expected: FAIL — module `./ask-user.js` not found.

- [ ] **Step 3: Implement the ask_user tool**

Create `apps/backend/src/agent/tools/client/ask-user.ts`:

```typescript
import {
  askUserBridgeResponseSchema,
  askUserParametersSchema,
  askUserResultSchema,
  type ToolFailureData,
  TOOL_NAME,
} from '@omnicraft/tool-schemas';
import type {z} from 'zod';

import type {
  ToolDefinition,
  ToolExecuteFailureResult,
  ToolExecuteSuccessResult,
} from '@/agent-core/tool/types.js';

type AskUserResult = z.infer<typeof askUserResultSchema>;

export const askUserTool: ToolDefinition<
  typeof askUserParametersSchema,
  AskUserResult
> = {
  name: TOOL_NAME.ASK_USER,
  displayName: 'Ask User',
  description:
    'Ask the user one or more questions when you need clarification, preferences, or decisions that cannot be inferred from context. Use this tool when the task is ambiguous, multiple valid approaches exist, or user input is required to proceed. Each question can have predefined options for the user to select from, and the user can also type a custom answer. Do not use this tool for rhetorical questions or information you can determine yourself.',
  parameters: askUserParametersSchema,
  suppressToolEvents: false,

  async execute(
    args,
    context,
  ): Promise<
    ToolExecuteSuccessResult<AskUserResult> | ToolExecuteFailureResult
  > {
    const response = await context.userInteractionBridge.waitForResponse(
      context.callId,
      context.signal,
    );
    const parsed = askUserBridgeResponseSchema.parse(response);

    if (parsed.cancelled) {
      const data: ToolFailureData = {message: 'User declined to answer.'};
      return {
        data,
        content: 'User declined to answer.',
        status: 'failure',
      };
    }

    return {
      data: {answers: parsed.answers},
      content: formatAnswersForLlm(parsed.answers),
      status: 'success',
    };
  },
};

function formatAnswersForLlm(answers: AskUserResult['answers']): string {
  return answers
    .map(({question, answer}) =>
      answer !== null
        ? `Q: ${question}\nA: ${answer}`
        : `Q: ${question}\nA: (no answer)`,
    )
    .join('\n\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run --filter 'backend' test -- ask-user`

Expected: All 3 tests PASS.

- [ ] **Step 5: Create ClientToolRegistry**

Create `apps/backend/src/agent/tools/client/client-tool-registry.ts`:

```typescript
import {ToolRegistry} from '@/agent-core/tool/index.js';

import {askUserTool} from './ask-user.js';

/** Registry for client-side tools that require user interaction. */
export class ClientToolRegistry extends ToolRegistry {
  /** Creates the singleton and registers all client-side tools. */
  static override create(): ClientToolRegistry {
    const instance = super.create() as ClientToolRegistry;
    instance.register(askUserTool);
    return instance;
  }
}
```

- [ ] **Step 6: Create barrel export**

Create `apps/backend/src/agent/tools/client/index.ts`:

```typescript
export {ClientToolRegistry} from './client-tool-registry.js';
```

- [ ] **Step 7: Export from tools barrel**

In `apps/backend/src/agent/tools/index.ts`, add:

```typescript
export {ClientToolRegistry} from './client/index.js';
```

- [ ] **Step 8: Register in MainAgent**

In `apps/backend/src/agent/agents/main-agent/main-agent.ts`:

1. Add import: `ClientToolRegistry` to the import from `@/agent/tools/index.js`
2. Add `ClientToolRegistry.getInstance()` to the `toolRegistries` array

```typescript
import {
  BashToolRegistry,
  ClientToolRegistry,
  CoreToolRegistry,
  FileToolRegistry,
  SubAgentToolRegistry,
  WebToolRegistry,
} from '@/agent/tools/index.js';

// In the constructor:
toolRegistries: [
  CoreToolRegistry.getInstance(),
  FileToolRegistry.getInstance(),
  WebToolRegistry.getInstance(),
  BashToolRegistry.getInstance(),
  SubAgentToolRegistry.getInstance(),
  ClientToolRegistry.getInstance(),
],
```

- [ ] **Step 9: Run all backend tests**

Run: `bun run --filter 'backend' test`

Expected: All tests pass.

- [ ] **Step 10: Commit**

```bash
git add apps/backend/src/agent/tools/client/ apps/backend/src/agent/tools/index.ts apps/backend/src/agent/agents/main-agent/main-agent.ts
git commit -m "feat(backend): add ask_user client-side tool with ClientToolRegistry"
```

---

### Task 4: Refactor useSessionId to context-backed

**Files:**

- Create: `apps/frontend/src/pages/chat/contexts/SessionIdContext/SessionIdContext.ts`
- Create: `apps/frontend/src/pages/chat/contexts/SessionIdContext/SessionIdProvider.tsx`
- Create: `apps/frontend/src/pages/chat/contexts/SessionIdContext/index.ts`
- Modify: `apps/frontend/src/pages/chat/hooks/useSessionId.ts`
- Modify: `apps/frontend/src/pages/chat/ChatPage.tsx`

- [ ] **Step 1: Create SessionIdContext**

Create `apps/frontend/src/pages/chat/contexts/SessionIdContext/SessionIdContext.ts`:

```typescript
import {createContext} from 'react';

export interface SessionIdContextValue {
  sessionId: string | null;
  createNewSessionIdError: string | null;
  createNewSessionId: (config?: {
    workspace?: string;
    extraAllowedPaths?: readonly string[];
  }) => Promise<string | null>;
  clearSessionId: () => void;
  clearCreateNewSessionIdError: () => void;
}

export const SessionIdContext = createContext<SessionIdContextValue | null>(
  null,
);
```

- [ ] **Step 2: Create SessionIdProvider**

Create `apps/frontend/src/pages/chat/contexts/SessionIdContext/SessionIdProvider.tsx`:

```typescript
import {type ReactNode, useCallback, useMemo, useState} from 'react';

import {createSession} from '@/api/chat/index.js';

import {
  SessionIdContext,
  type SessionIdContextValue,
} from './SessionIdContext.js';

interface SessionConfig {
  workspace?: string;
  extraAllowedPaths?: readonly string[];
}

export function SessionIdProvider({children}: {children: ReactNode}) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const createNewSessionId = useCallback(
    async (config: SessionConfig = {}) => {
      setError(null);
      try {
        const id = await createSession(config);
        setSessionId(id);
        return id;
      } catch (e) {
        console.error('Failed to create session', e);
        const message =
          e instanceof Error ? e.message : 'Failed to create session';
        setError(message);
        return null;
      }
    },
    [],
  );

  const clearSessionId = useCallback(() => {
    setSessionId(null);
    setError(null);
  }, []);

  const clearCreateNewSessionIdError = useCallback(() => {
    setError(null);
  }, []);

  const value: SessionIdContextValue = useMemo(
    () => ({
      sessionId,
      createNewSessionIdError: error,
      createNewSessionId,
      clearSessionId,
      clearCreateNewSessionIdError,
    }),
    [
      sessionId,
      error,
      createNewSessionId,
      clearSessionId,
      clearCreateNewSessionIdError,
    ],
  );

  return <SessionIdContext value={value}>{children}</SessionIdContext>;
}
```

- [ ] **Step 3: Create barrel export**

Create `apps/frontend/src/pages/chat/contexts/SessionIdContext/index.ts`:

```typescript
export {SessionIdContext} from './SessionIdContext.js';
export {SessionIdProvider} from './SessionIdProvider.js';
```

- [ ] **Step 4: Rewrite useSessionId as context consumer**

Replace `apps/frontend/src/pages/chat/hooks/useSessionId.ts` with:

```typescript
import assert from 'node:assert';

import {useContext} from 'react';

import {
  SessionIdContext,
  type SessionIdContextValue,
} from '../contexts/SessionIdContext/index.js';

/**
 * Returns the session ID and lifecycle methods.
 * Must be used within a SessionIdProvider.
 */
export function useSessionId(): SessionIdContextValue {
  const value = useContext(SessionIdContext);
  assert(value, 'useSessionId must be used within a SessionIdProvider');
  return value;
}
```

- [ ] **Step 5: Add SessionIdProvider to ChatPage**

In `apps/frontend/src/pages/chat/ChatPage.tsx`:

1. Add import: `SessionIdProvider` from `./contexts/SessionIdContext/index.js`
2. Wrap the provider stack with `SessionIdProvider` (outermost or at least above `ChatPageContent`):

```typescript
export function ChatPage() {
  return (
    <SessionIdProvider>
      <ChatEventBusProvider>
        <SessionConfigProvider>
          <ToolOutputProvider>
            <ChatPageContent />
          </ToolOutputProvider>
        </SessionConfigProvider>
      </ChatEventBusProvider>
    </SessionIdProvider>
  );
}
```

`ChatPageContent` already calls `useSessionId()` — no change needed there since the hook API is unchanged.

- [ ] **Step 6: Verify the frontend builds and works**

Run: `bun run --filter 'frontend' check`

Expected: No type errors.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/pages/chat/contexts/SessionIdContext/ apps/frontend/src/pages/chat/hooks/useSessionId.ts apps/frontend/src/pages/chat/ChatPage.tsx
git commit -m "refactor(frontend): make useSessionId context-backed for deep access"
```

---

### Task 5: Create AskUserCard frontend component

**Files:**

- Create: `apps/frontend/src/pages/chat/components/MessageList/components/AskUserCard/types.ts`
- Create: `apps/frontend/src/pages/chat/components/MessageList/components/AskUserCard/hooks/useQuestions.ts`
- Create: `apps/frontend/src/pages/chat/components/MessageList/components/AskUserCard/hooks/useFormState.ts`
- Create: `apps/frontend/src/pages/chat/components/MessageList/components/AskUserCard/hooks/useSubmitActions.ts`
- Create: `apps/frontend/src/pages/chat/components/MessageList/components/AskUserCard/components/CompletedCard/CompletedCard.tsx`
- Create: `apps/frontend/src/pages/chat/components/MessageList/components/AskUserCard/components/CompletedCard/styles.module.css`
- Create: `apps/frontend/src/pages/chat/components/MessageList/components/AskUserCard/components/CompletedCard/index.ts`
- Create: `apps/frontend/src/pages/chat/components/MessageList/components/AskUserCard/components/CancelledCard/CancelledCard.tsx`
- Create: `apps/frontend/src/pages/chat/components/MessageList/components/AskUserCard/components/CancelledCard/styles.module.css`
- Create: `apps/frontend/src/pages/chat/components/MessageList/components/AskUserCard/components/CancelledCard/index.ts`
- Create: `apps/frontend/src/pages/chat/components/MessageList/components/AskUserCard/components/QuestionItem/QuestionItem.tsx`
- Create: `apps/frontend/src/pages/chat/components/MessageList/components/AskUserCard/components/QuestionItem/styles.module.css`
- Create: `apps/frontend/src/pages/chat/components/MessageList/components/AskUserCard/components/QuestionItem/index.ts`
- Create: `apps/frontend/src/pages/chat/components/MessageList/components/AskUserCard/AskUserCardView.tsx`
- Create: `apps/frontend/src/pages/chat/components/MessageList/components/AskUserCard/AskUserCard.tsx`
- Create: `apps/frontend/src/pages/chat/components/MessageList/components/AskUserCard/styles.module.css`
- Create: `apps/frontend/src/pages/chat/components/MessageList/components/AskUserCard/index.ts`

- [ ] **Step 1: Create shared types**

Create `apps/frontend/src/pages/chat/components/MessageList/components/AskUserCard/types.ts`:

```typescript
import type {askUserParametersSchema} from '@omnicraft/tool-schemas';
import type {z} from 'zod';

export type Question = z.infer<
  typeof askUserParametersSchema
>['questions'][number];

export interface AnswerEntry {
  question: string;
  answer: string | null;
}
```

- [ ] **Step 2: Create useQuestions hook — parses tool arguments**

Create `apps/frontend/src/pages/chat/components/MessageList/components/AskUserCard/hooks/useQuestions.ts`:

```typescript
import {askUserParametersSchema} from '@omnicraft/tool-schemas';
import {useMemo} from 'react';

import type {Question} from '../types.js';

/** Parses and validates the tool arguments JSON into a Question array. */
export function useQuestions(toolArguments: string): Question[] {
  return useMemo(() => {
    try {
      const parsed: unknown = JSON.parse(toolArguments);
      const result = askUserParametersSchema.safeParse(parsed);
      return result.success ? result.data.questions : [];
    } catch {
      return [];
    }
  }, [toolArguments]);
}
```

- [ ] **Step 3: Create useFormState hook — manages selections and custom text**

Create `apps/frontend/src/pages/chat/components/MessageList/components/AskUserCard/hooks/useFormState.ts`:

```typescript
import {useCallback, useState} from 'react';

import type {AnswerEntry, Question} from '../types.js';

const OTHER_VALUE = '__other__';

export interface FormState {
  /** Selected option value per question index. */
  selectedOptionByIndex: ReadonlyMap<number, string>;
  /** Custom text input value per question index. */
  customTextByIndex: ReadonlyMap<number, string>;
  /** Whether each question is using the custom "Other" option. */
  isCustomByIndex: ReadonlyMap<number, boolean>;
  /** Select a predefined option for a question. */
  selectOption: (questionIndex: number, option: string) => void;
  /** Switch to custom "Other" input for a question. */
  switchToCustom: (questionIndex: number) => void;
  /** Update custom text for a question. */
  setCustomText: (questionIndex: number, text: string) => void;
  /** Collect current form state into an AnswerEntry array. */
  collectAnswers: () => AnswerEntry[];
}

/** Manages the form selection state for the questionnaire. */
export function useFormState(questions: Question[]): FormState {
  const [selectedOptionByIndex, setSelectedOptionByIndex] = useState<
    Map<number, string>
  >(() => new Map());
  const [customTextByIndex, setCustomTextByIndex] = useState<
    Map<number, string>
  >(() => new Map());
  const [isCustomByIndex, setIsCustomByIndex] = useState<Map<number, boolean>>(
    () => new Map(),
  );

  const selectOption = useCallback((questionIndex: number, option: string) => {
    setSelectedOptionByIndex((prev) =>
      new Map(prev).set(questionIndex, option),
    );
    setIsCustomByIndex((prev) => new Map(prev).set(questionIndex, false));
  }, []);

  const switchToCustom = useCallback((questionIndex: number) => {
    setSelectedOptionByIndex((prev) =>
      new Map(prev).set(questionIndex, OTHER_VALUE),
    );
    setIsCustomByIndex((prev) => new Map(prev).set(questionIndex, true));
  }, []);

  const setCustomText = useCallback((questionIndex: number, text: string) => {
    setCustomTextByIndex((prev) => new Map(prev).set(questionIndex, text));
  }, []);

  const collectAnswers = useCallback((): AnswerEntry[] => {
    return questions.map((q, i) => {
      if (isCustomByIndex.get(i)) {
        const text = customTextByIndex.get(i)?.trim();
        return {question: q.question, answer: text || null};
      }
      const selected = selectedOptionByIndex.get(i);
      if (selected && selected !== OTHER_VALUE) {
        return {question: q.question, answer: selected};
      }
      return {question: q.question, answer: null};
    });
  }, [questions, selectedOptionByIndex, customTextByIndex, isCustomByIndex]);

  return {
    selectedOptionByIndex,
    customTextByIndex,
    isCustomByIndex,
    selectOption,
    switchToCustom,
    setCustomText,
    collectAnswers,
  };
}
```

- [ ] **Step 4: Create useSubmitActions hook — handles submit and cancel**

Create `apps/frontend/src/pages/chat/components/MessageList/components/AskUserCard/hooks/useSubmitActions.ts`:

```typescript
import {toast} from '@heroui/react';
import {useCallback, useState} from 'react';

import {submitToolResponse} from '@/api/chat/index.js';

import {useSessionId} from '../../../../../hooks/useSessionId.js';
import type {AnswerEntry} from '../types.js';

interface UseSubmitActionsParams {
  callId: string;
  collectAnswers: () => AnswerEntry[];
}

export interface SubmitActions {
  submitting: boolean;
  handleSubmit: () => void;
  handleCancel: () => void;
}

/** Handles submitting or cancelling the questionnaire via the bridge API. */
export function useSubmitActions({
  callId,
  collectAnswers,
}: UseSubmitActionsParams): SubmitActions {
  const {sessionId} = useSessionId();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!sessionId || submitting) return;
    setSubmitting(true);

    const answers = collectAnswers();
    try {
      await submitToolResponse(sessionId, callId, {
        cancelled: false,
        answers,
      });
    } catch {
      setSubmitting(false);
      toast.error('Failed to submit response. Please try again.');
    }
  }, [sessionId, callId, collectAnswers, submitting]);

  const handleCancel = useCallback(async () => {
    if (!sessionId || submitting) return;
    setSubmitting(true);

    try {
      await submitToolResponse(sessionId, callId, {cancelled: true});
    } catch {
      setSubmitting(false);
      toast.error('Failed to cancel. Please try again.');
    }
  }, [sessionId, callId, submitting]);

  return {submitting, handleSubmit, handleCancel};
}
```

- [ ] **Step 5: Create CompletedCard subcomponent**

Create `apps/frontend/src/pages/chat/components/MessageList/components/AskUserCard/components/CompletedCard/CompletedCard.tsx`:

```typescript
import {CircleCheck} from 'lucide-react';

import type {AnswerEntry} from '../../types.js';
import styles from './styles.module.css';

interface CompletedCardProps {
  answers: AnswerEntry[];
}

export function CompletedCard({answers}: CompletedCardProps) {
  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <CircleCheck size={16} className={styles.statusIcon} />
        <span className={styles.headerTitle}>Questions Answered</span>
      </div>
      <div className={styles.body}>
        {answers.map(({question, answer}, i) => (
          <div key={i} className={styles.answerBlock}>
            <span className={styles.question}>{question}</span>
            <span className={styles.answer}>{answer ?? '(no answer)'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

Create `apps/frontend/src/pages/chat/components/MessageList/components/AskUserCard/components/CompletedCard/styles.module.css`:

```css
.card {
  border-radius: 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  overflow: hidden;
  width: 400px;
  max-width: 100%;
}

.header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
}

.statusIcon {
  color: var(--success);
  flex-shrink: 0;
}

.headerTitle {
  font-weight: 600;
  font-size: 0.875rem;
}

.body {
  padding: 0 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.answerBlock {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.question {
  font-size: 0.875rem;
  font-weight: 500;
}

.answer {
  font-size: 0.8125rem;
  color: var(--muted);
  padding-left: 4px;
}
```

Create `apps/frontend/src/pages/chat/components/MessageList/components/AskUserCard/components/CompletedCard/index.ts`:

```typescript
export {CompletedCard} from './CompletedCard.js';
```

- [ ] **Step 6: Create CancelledCard subcomponent**

Create `apps/frontend/src/pages/chat/components/MessageList/components/AskUserCard/components/CancelledCard/CancelledCard.tsx`:

```typescript
import {CircleAlert} from 'lucide-react';

import styles from './styles.module.css';

interface CancelledCardProps {
  message: string | null;
}

export function CancelledCard({message}: CancelledCardProps) {
  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <CircleAlert size={16} className={styles.statusIcon} />
        <span className={styles.headerTitle}>
          {message ?? 'User declined to answer.'}
        </span>
      </div>
    </div>
  );
}
```

Create `apps/frontend/src/pages/chat/components/MessageList/components/AskUserCard/components/CancelledCard/styles.module.css`:

```css
.card {
  border-radius: 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  overflow: hidden;
  width: 400px;
  max-width: 100%;
}

.header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
}

.statusIcon {
  color: var(--warning);
  flex-shrink: 0;
}

.headerTitle {
  font-weight: 600;
  font-size: 0.875rem;
}
```

Create `apps/frontend/src/pages/chat/components/MessageList/components/AskUserCard/components/CancelledCard/index.ts`:

```typescript
export {CancelledCard} from './CancelledCard.js';
```

- [ ] **Step 7: Create QuestionItem subcomponent**

Create `apps/frontend/src/pages/chat/components/MessageList/components/AskUserCard/components/QuestionItem/QuestionItem.tsx`:

```typescript
import {Input, Label, Radio, RadioGroup, TextField} from '@heroui/react';

import type {FormState} from '../../hooks/useFormState.js';
import type {Question} from '../../types.js';
import styles from './styles.module.css';

const OTHER_VALUE = '__other__';

interface QuestionItemProps {
  question: Question;
  index: number;
  formState: FormState;
  disabled: boolean;
}

export function QuestionItem({
  question,
  index,
  formState,
  disabled,
}: QuestionItemProps) {
  return (
    <div className={styles.questionBlock}>
      <span className={styles.questionText}>{question.question}</span>
      {question.options.length > 0 ? (
        <RadioGroup
          isDisabled={disabled}
          value={formState.selectedOptionByIndex.get(index) ?? ''}
          onChange={(value) => {
            if (value === OTHER_VALUE) {
              formState.switchToCustom(index);
            } else {
              formState.selectOption(index, value);
            }
          }}
        >
          {question.options.map((option) => (
            <Radio key={option} value={option}>
              <Radio.Control>
                <Radio.Indicator />
              </Radio.Control>
              <Radio.Content>
                <Label>{option}</Label>
              </Radio.Content>
            </Radio>
          ))}
          <Radio value={OTHER_VALUE}>
            <Radio.Control>
              <Radio.Indicator />
            </Radio.Control>
            <Radio.Content>
              <Label>Other</Label>
            </Radio.Content>
          </Radio>
        </RadioGroup>
      ) : null}
      {(question.options.length === 0 ||
        formState.isCustomByIndex.get(index)) && (
        <TextField
          isDisabled={disabled}
          value={formState.customTextByIndex.get(index) ?? ''}
          onChange={(value) => {
            formState.setCustomText(index, value);
          }}
        >
          <Label className={styles.srOnly}>Your answer</Label>
          <Input placeholder='Type your answer...' />
        </TextField>
      )}
    </div>
  );
}
```

Create `apps/frontend/src/pages/chat/components/MessageList/components/AskUserCard/components/QuestionItem/styles.module.css`:

```css
.questionBlock {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.questionText {
  font-size: 0.875rem;
  font-weight: 500;
}

.srOnly {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
```

Create `apps/frontend/src/pages/chat/components/MessageList/components/AskUserCard/components/QuestionItem/index.ts`:

```typescript
export {QuestionItem} from './QuestionItem.js';
```

- [ ] **Step 8: Create AskUserCardView**

Create `apps/frontend/src/pages/chat/components/MessageList/components/AskUserCard/AskUserCardView.tsx`:

```typescript
import {Button, Spinner} from '@heroui/react';
import {MessageCircleQuestion} from 'lucide-react';

import {CancelledCard} from './components/CancelledCard/index.js';
import {CompletedCard} from './components/CompletedCard/index.js';
import {QuestionItem} from './components/QuestionItem/index.js';
import type {FormState} from './hooks/useFormState.js';
import type {SubmitActions} from './hooks/useSubmitActions.js';
import type {AnswerEntry, Question} from './types.js';
import styles from './styles.module.css';

type CardStatus = 'running' | 'done' | 'failure' | 'error';

interface AskUserCardViewProps {
  questions: Question[];
  formState: FormState;
  submitActions: SubmitActions;
  status: CardStatus;
  completedAnswers: AnswerEntry[] | null;
  failureMessage: string | null;
}

export function AskUserCardView({
  questions,
  formState,
  submitActions,
  status,
  completedAnswers,
  failureMessage,
}: AskUserCardViewProps) {
  if (status === 'done' && completedAnswers) {
    return <CompletedCard answers={completedAnswers} />;
  }

  if (status === 'failure' || status === 'error') {
    return <CancelledCard message={failureMessage} />;
  }

  const disabled = submitActions.submitting;

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <MessageCircleQuestion size={16} className={styles.headerIcon} />
        <span className={styles.headerTitle}>Questions from Assistant</span>
      </div>
      <div className={styles.body}>
        {questions.map((q, i) => (
          <QuestionItem
            key={i}
            question={q}
            index={i}
            formState={formState}
            disabled={disabled}
          />
        ))}
      </div>
      <div className={styles.footer}>
        <Button variant='ghost' isDisabled={disabled} onPress={submitActions.handleCancel}>
          Cancel
        </Button>
        <Button variant='solid' isDisabled={disabled} onPress={submitActions.handleSubmit}>
          {submitActions.submitting ? <Spinner size='sm' /> : 'Submit'}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Create AskUserCardView styles**

Create `apps/frontend/src/pages/chat/components/MessageList/components/AskUserCard/styles.module.css`:

```css
.card {
  border-radius: 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  overflow: hidden;
  width: 400px;
  max-width: 100%;
}

.header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
}

.headerIcon {
  color: var(--accent);
  flex-shrink: 0;
}

.headerTitle {
  font-weight: 600;
  font-size: 0.875rem;
}

.body {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid var(--border);
}
```

- [ ] **Step 10: Create the container component**

Create `apps/frontend/src/pages/chat/components/MessageList/components/AskUserCard/AskUserCard.tsx`:

```typescript
import type {ToolFailureData, ToolResultData} from '@omnicraft/tool-schemas';

import {AskUserCardView} from './AskUserCardView.js';
import {useFormState} from './hooks/useFormState.js';
import {useQuestions} from './hooks/useQuestions.js';
import {useSubmitActions} from './hooks/useSubmitActions.js';

type AskUserCardProps =
  | {callId: string; arguments: string; status: 'running'}
  | {
      callId: string;
      arguments: string;
      status: 'done';
      data: ToolResultData<'ask_user'>;
    }
  | {
      callId: string;
      arguments: string;
      status: 'failure' | 'error';
      data: ToolFailureData;
    };

export function AskUserCard(props: AskUserCardProps) {
  const questions = useQuestions(props.arguments);
  const formState = useFormState(questions);
  const submitActions = useSubmitActions({
    callId: props.callId,
    collectAnswers: formState.collectAnswers,
  });

  const completedAnswers =
    props.status === 'done' ? props.data.answers : null;

  const failureMessage =
    props.status === 'failure' || props.status === 'error'
      ? props.data.message
      : null;

  return (
    <AskUserCardView
      questions={questions}
      formState={formState}
      submitActions={submitActions}
      status={props.status}
      completedAnswers={completedAnswers}
      failureMessage={failureMessage}
    />
  );
}
```

- [ ] **Step 11: Create barrel export**

Create `apps/frontend/src/pages/chat/components/MessageList/components/AskUserCard/index.ts`:

```typescript
export {AskUserCard} from './AskUserCard.js';
```

- [ ] **Step 12: Verify types compile**

Run: `bun run --filter 'frontend' check`

Expected: No type errors.

- [ ] **Step 13: Commit**

```bash
git add apps/frontend/src/pages/chat/components/MessageList/components/AskUserCard/
git commit -m "feat(frontend): add AskUserCard questionnaire component"
```

---

### Task 6: Branch RenderItem to use AskUserCard

**Files:**

- Modify: `apps/frontend/src/pages/chat/components/MessageList/components/RenderItem/RenderItem.tsx`

- [ ] **Step 1: Add import and branching logic**

In `apps/frontend/src/pages/chat/components/MessageList/components/RenderItem/RenderItem.tsx`:

1. Add import: `TOOL_NAME` from `@omnicraft/tool-schemas`
2. Add import: `AskUserCard` from `../AskUserCard/index.js`
3. In the `case 'tool-execution':` branch, add the check before `ToolExecutionCard`:

```typescript
import {TOOL_NAME} from '@omnicraft/tool-schemas';
import clsx from 'clsx';

import {formatTimestamp} from '../../helpers/formatTimestamp.js';
import type {MessageRenderItem} from '../../hooks/useMessageList.js';
import {AskUserCard} from '../AskUserCard/index.js';
import {MessageBubble} from '../MessageBubble/index.js';
import {ThinkingBlock} from '../ThinkingBlock/index.js';
import {ToolExecutionCard} from '../ToolExecutionCard/index.js';
import styles from './styles.module.css';

interface RenderItemProps {
  item: MessageRenderItem;
}

export function RenderItem({item}: RenderItemProps) {
  switch (item.type) {
    case 'user-text':
      return (
        <div className={styles.userMessage}>
          <MessageBubble role='user' id={item.id} content={item.content} />
          {item.createdAt !== null && (
            <time className={styles.timestamp}>
              {formatTimestamp(item.createdAt)}
            </time>
          )}
        </div>
      );
    case 'assistant-text':
      return (
        <div className={styles.assistantMessage}>
          <MessageBubble role='assistant' id={item.id} content={item.content} />
          {item.createdAt !== null && (
            <time className={clsx(styles.timestamp, styles.timestampRight)}>
              {formatTimestamp(item.createdAt)}
            </time>
          )}
        </div>
      );
    case 'tool-execution':
      if (item.toolName === TOOL_NAME.ASK_USER) {
        if (item.status === 'running') {
          return (
            <div className={styles.assistantMessage}>
              <AskUserCard
                callId={item.callId}
                arguments={item.arguments}
                status='running'
              />
            </div>
          );
        }
        if (item.status === 'done') {
          return (
            <div className={styles.assistantMessage}>
              <AskUserCard
                callId={item.callId}
                arguments={item.arguments}
                status='done'
                data={item.data}
              />
            </div>
          );
        }
        return (
          <div className={styles.assistantMessage}>
            <AskUserCard
              callId={item.callId}
              arguments={item.arguments}
              status={item.status}
              data={item.data}
            />
          </div>
        );
      }
      return (
        <div className={styles.assistantMessage}>
          <ToolExecutionCard
            callId={item.callId}
            toolName={item.toolName}
            displayName={item.displayName}
            arguments={item.arguments}
            status={item.status}
            result={'result' in item ? item.result : undefined}
            data={'data' in item ? item.data : undefined}
          />
        </div>
      );
    case 'thinking':
      return (
        <div className={styles.assistantMessage}>
          <ThinkingBlock content={item.content} done={item.done} />
        </div>
      );
  }
}
```

- [ ] **Step 2: Verify types compile**

Run: `bun run --filter 'frontend' check`

Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/pages/chat/components/MessageList/components/RenderItem/RenderItem.tsx
git commit -m "feat(frontend): route ask_user tool to AskUserCard in RenderItem"
```

---

### Task 7: Add useMessageList tests for ask_user

**Files:**

- Modify: `apps/frontend/src/pages/chat/components/MessageList/hooks/useMessageList.test.ts`

- [ ] **Step 1: Add test for completed ask_user rendering**

Append to the `describe('transformMessages', ...)` block in `useMessageList.test.ts`:

```typescript
it('pairs ask_user tool start and end events', () => {
  const messages: ChatMessage[] = [
    {
      id: null,
      createdAt: null,
      role: 'assistant',
      content: {
        type: 'tool-execute-start',
        callId: 'c1',
        toolName: 'ask_user',
        displayName: 'Ask User',
        arguments:
          '{"questions":[{"question":"City?","options":["NYC","SF"]}]}',
      },
    },
    {
      id: null,
      createdAt: null,
      role: 'assistant',
      content: {
        type: 'tool-execute-end',
        callId: 'c1',
        result: 'Q: City?\nA: SF',
        status: 'success',
        data: {
          answers: [{question: 'City?', answer: 'SF'}],
        },
      },
    },
  ];
  const result = transformMessages(messages);
  expect(result).toEqual([
    {
      type: 'tool-execution',
      callId: 'c1',
      toolName: 'ask_user',
      displayName: 'Ask User',
      arguments: '{"questions":[{"question":"City?","options":["NYC","SF"]}]}',
      status: 'done',
      result: 'Q: City?\nA: SF',
      data: {answers: [{question: 'City?', answer: 'SF'}]},
    },
  ]);
});
```

- [ ] **Step 2: Add test for running (pending) ask_user**

```typescript
it('marks ask_user as running when no end event exists', () => {
  const messages: ChatMessage[] = [
    {
      id: null,
      createdAt: null,
      role: 'assistant',
      content: {
        type: 'tool-execute-start',
        callId: 'c1',
        toolName: 'ask_user',
        displayName: 'Ask User',
        arguments: '{"questions":[{"question":"Name?","options":[]}]}',
      },
    },
  ];
  const result = transformMessages(messages);
  expect(result).toEqual([
    {
      type: 'tool-execution',
      callId: 'c1',
      toolName: 'ask_user',
      displayName: 'Ask User',
      arguments: '{"questions":[{"question":"Name?","options":[]}]}',
      status: 'running',
    },
  ]);
});
```

- [ ] **Step 3: Add test for cancelled ask_user**

```typescript
it('marks ask_user as failure when user cancels', () => {
  const messages: ChatMessage[] = [
    {
      id: null,
      createdAt: null,
      role: 'assistant',
      content: {
        type: 'tool-execute-start',
        callId: 'c1',
        toolName: 'ask_user',
        displayName: 'Ask User',
        arguments: '{"questions":[{"question":"City?","options":["A"]}]}',
      },
    },
    {
      id: null,
      createdAt: null,
      role: 'assistant',
      content: {
        type: 'tool-execute-end',
        callId: 'c1',
        result: 'User declined to answer.',
        status: 'failure',
        data: {message: 'User declined to answer.'},
      },
    },
  ];
  const result = transformMessages(messages);
  expect(result).toEqual([
    {
      type: 'tool-execution',
      callId: 'c1',
      toolName: 'ask_user',
      displayName: 'Ask User',
      arguments: '{"questions":[{"question":"City?","options":["A"]}]}',
      status: 'failure',
      result: 'User declined to answer.',
      data: {message: 'User declined to answer.'},
    },
  ]);
});
```

- [ ] **Step 4: Run tests**

Run: `bun run --filter 'frontend' test`

Expected: All tests pass (including the 3 new ones and all existing ones).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/chat/components/MessageList/hooks/useMessageList.test.ts
git commit -m "test(frontend): add useMessageList tests for ask_user tool events"
```

---

### Task 8: Final verification

- [ ] **Step 1: Run all backend tests**

Run: `bun run --filter 'backend' test`

Expected: All pass.

- [ ] **Step 2: Run all frontend tests**

Run: `bun run --filter 'frontend' test`

Expected: All pass.

- [ ] **Step 3: Run lint and format check**

Run: `bun run lint && bun run format:check`

Expected: No errors.

- [ ] **Step 4: Verify backend starts**

Run: `bun run --filter 'backend' dev` and confirm no startup errors.

- [ ] **Step 5: Verify frontend starts**

Run: `bun run --filter 'frontend' dev` and confirm no build errors.
