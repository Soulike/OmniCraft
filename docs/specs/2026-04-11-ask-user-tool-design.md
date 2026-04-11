# ask_user Client-Side Tool Design

**Issue:** #106
**Date:** 2026-04-11

## Overview

Implement an `ask_user` client-side tool that allows the LLM to present questionnaires to the user. Each questionnaire contains one or more questions with predefined options; the user can pick an option or type a custom answer. The UI provides Submit and Cancel buttons.

This is a unified tool — a single free-text question is a questionnaire with one entry and an empty options array.

## Data Model

### Tool Parameters (LLM → Backend)

```typescript
const parameters = z.object({
  questions: z.array(
    z.object({
      question: z.string(),
      options: z.array(z.string()), // predefined choices; empty = free-text only
    }),
  ),
});
```

### Bridge Response (Frontend → Backend via POST /tool-response)

```typescript
const askUserBridgeResponseSchema = z.discriminatedUnion('cancelled', [
  z.object({
    cancelled: z.literal(false),
    answers: z.array(
      z.object({
        question: z.string(),
        answer: z.string().nullable(), // null = unanswered
      }),
    ),
  }),
  z.object({
    cancelled: z.literal(true),
  }),
]);
```

### Tool Result Schema (Backend → LLM + Frontend SSE)

```typescript
// Success (user submitted)
const askUserResultSchema = z.object({
  answers: z.array(
    z.object({
      question: z.string(),
      answer: z.string().nullable(),
    }),
  ),
});

// Failure (user cancelled) — uses shared toolFailureDataSchema
// { message: "User declined to answer." }
```

## Backend Changes

### 1. ToolExecutionContext — add callId

The `callId` from the LLM API response uniquely identifies each tool invocation. Adding it to the context lets client-side tools use it as the interaction ID for the bridge, eliminating the need for a separate ID and aligning with what the frontend already receives in `tool-execute-start`.

```typescript
export interface ToolExecutionContext {
  // ... existing fields ...
  readonly callId: string;
}
```

In `agent.ts` `executeTool()`, pass `callId: toolCall.callId` when constructing the context object.

### 2. @omnicraft/tool-schemas

**tool-name.ts:**

- Add `ASK_USER: 'ask_user'` to `TOOL_NAME`
- Add to `toolNameSchema` enum

**result-schemas.ts:**

- Add `askUserResultSchema` (as defined above)

**registry.ts:**

- Add `[TOOL_NAME.ASK_USER]: askUserResultSchema` to `toolResultSchemas`
- Add `askUserResultSchema` to `toolResultDataSchema` union

### 3. Tool Implementation

**File:** `apps/backend/src/agent/tools/client/ask-user.ts`

```typescript
export const askUserTool: ToolDefinition<typeof parameters, AskUserResult> = {
  name: TOOL_NAME.ASK_USER,
  displayName: 'Ask User',
  description:
    'Ask the user one or more questions when you need clarification, preferences, or decisions that cannot be inferred from context. Use this tool when the task is ambiguous, multiple valid approaches exist, or user input is required to proceed. Each question can have predefined options for the user to select from, and the user can also type a custom answer. Do not use this tool for rhetorical questions or information you can determine yourself.',
  parameters,
  suppressToolEvents: false,
  async execute(args, context) {
    const response = await context.userInteractionBridge.waitForResponse(
      context.callId,
      context.signal,
    );
    const parsed = askUserBridgeResponseSchema.parse(response);

    if (parsed.cancelled) {
      return {
        data: {message: 'User declined to answer.'},
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
```

### 4. ClientToolRegistry

**File:** `apps/backend/src/agent/tools/client/client-tool-registry.ts`

New `ClientToolRegistry` extending `ToolRegistry`. Registers `askUserTool`.

Registered only in `MainAgent` (not sub-agents — only the main agent interacts with the user directly).

## Frontend Changes

### 1. useSessionId Context Refactor

Refactor `useSessionId` to be backed by a React context. The hook API stays the same. A `SessionIdProvider` wraps the chat page, making `sessionId` available to any descendant (including `AskUserCard`) without prop drilling.

### 2. RenderItem Branching

In `RenderItem.tsx`, detect `toolName === TOOL_NAME.ASK_USER` and render `AskUserCard` instead of `ToolExecutionCard`:

```typescript
case 'tool-execution':
  if (item.toolName === TOOL_NAME.ASK_USER) {
    return <AskUserCard {...item} />;
  }
  return <ToolExecutionCard {...item} />;
```

### 3. AskUserCard Component (MVVM)

```
MessageList/components/AskUserCard/
├── AskUserCard.tsx           # Container — composes hooks, passes to view
├── AskUserCardView.tsx       # Stateless view — renders form/completed/cancelled
├── hooks/
│   └── useAskUserCard.ts     # View model — form state, submit/cancel handlers
├── styles.module.css
└── index.ts
```

**States:**

| State      | Trigger                                         | UI                               |
| ---------- | ----------------------------------------------- | -------------------------------- |
| Active     | `status: 'running'` (no end event)              | Interactive form                 |
| Submitting | User clicks Submit (local state)                | Disabled form, spinner on button |
| Completed  | `status: 'done'` (end event, success)           | Read-only Q&A summary            |
| Cancelled  | `status: 'failure'` (end event, user cancelled) | "User declined" message          |

**Active state UI:**

- For each question:
  - Question text
  - If options exist: radio buttons for each option + "Other" radio revealing a text input
  - If no options: plain text input
- Bottom: Submit button (primary) + Cancel button (ghost/secondary)

**Submitting state:**

- All inputs disabled
- Submit button shows spinner/loading

**Completed state:**

- Read-only display of each question with the user's answer below it

**Cancelled state:**

- Message indicating the user declined

### 4. Submission Flow

1. User clicks Submit → `useAskUserCard` sets local `submitting` state, disables form
2. Calls `submitToolResponse(sessionId, callId, { cancelled: false, answers: [...] })`
3. Backend bridge resolves → tool validates → returns result
4. SSE emits `tool-execute-end` → `useMessageList` updates render item to `status: 'done'`
5. `AskUserCard` re-renders with completed view (from `data.answers`)

Cancel follows the same path with `{ cancelled: true }`, resulting in `status: 'failure'`.

## Data Flow

```
LLM calls ask_user({ questions: [{ question: "...", options: ["A", "B"] }] })
  → tool-execute-start { callId, toolName: 'ask_user', arguments: '{"questions":...}' }
  → Frontend renders AskUserCard (active state, form from arguments)
  → User selects/types answers, clicks Submit
  → POST /tool-response { interactionId: callId, result: { cancelled: false, answers: [...] } }
  → Bridge resolves → tool validates → returns success
  → tool-execute-end { callId, data: { answers: [...] }, status: 'success' }
  → AskUserCard re-renders as read-only completed view
```

## Replay / Persistence

When replaying a stored session (re-emitting SSE events):

- **Completed Q&A:** Both `tool-execute-start` and `tool-execute-end` exist. `useMessageList` pairs them, render item gets `status: 'done'`. AskUserCard renders read-only completed view from `end.data`.
- **Interrupted:** Only `tool-execute-start` exists. Render item gets `status: 'running'`. AskUserCard renders active form from `start.arguments`. If the backend session is still alive, the user can respond.

No special replay logic — the existing `useMessageList` transform handles the pairing.

## SSE Protocol

No changes. The existing `tool-execute-start` / `tool-execute-delta` / `tool-execute-end` events carry all required information. `tool-execute-delta` is not used by this tool (no streaming output needed).

## Key Design Decisions

1. **callId as interactionId:** Each tool call has a unique `callId` from the LLM API. Adding it to `ToolExecutionContext` lets client-side tools use it directly as the bridge interaction ID. The frontend already receives `callId` in `tool-execute-start`, so no protocol changes needed.

2. **Branch at RenderItem level:** The questionnaire has fundamentally different UX from the default tool card (interactive form vs. passive disclosure). A separate component at the dispatch level keeps concerns clean and scales for future client-side tools.

3. **Cancel returns failure to LLM:** When the user cancels, the tool returns a failure result with a message. The LLM can decide how to proceed (e.g., rephrase the question, skip the task, etc.).

4. **useSessionId context refactor:** Rather than prop-drilling sessionId through 5 component levels, refactor `useSessionId` to be context-backed. The hook API stays the same; descendants can call `useSessionId()` to access the session ID.
