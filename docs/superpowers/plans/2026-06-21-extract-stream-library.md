# Extract Self-Contained Stream Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `StreamingMessageDisplay` a business-agnostic stream library — feed it an `eventBus`, get a self-rendering chat stream — then relocate it to its own `modules/chat-stream/` module.

**Architecture:** Sever the stream's single business coupling (the `ask_user` submit path that reaches into `ChatSessionApiContext`) by injecting an optional `onAskUserSubmit` callback; remove `sessionId` from the public contract (it was only ever the first arg to `submitToolResponse`, now closed over by the logic layer inside the callback); then physically move the subtree to `modules/chat-stream/`. Contract changes land first as focused in-place commits; the path-churn move lands last so reviewers can separate logic from relocation.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, HeroUI, `@omnicraft/sse-events` + `@omnicraft/tool-schemas` (shared contract packages).

## Global Constraints

- Package manager / runner: **Bun**. Run commands with `bun`. Tests: `bun run test` (Vitest), **never** `bun test`.
- Test command (frontend): `cd apps/frontend && bun run test` (script is `vitest run`). Single file: `bun run test <path>`.
- Never use `any`. Use `unknown` + narrowing.
- In code use Node.js APIs, never Bun-specific APIs.
- CSS Modules only; no Tailwind utility classes in our components. HeroUI components used directly.
- One React component per file. MVVM: stateless `*View.tsx`, state in hooks, `*.tsx` container composes.
- Early-return style for `if`.
- Named exports only (no default export) except CSS module `import styles from './styles.module.css'`.
- Import the `index.ts` of a component folder, never internal files. Internal imports relative, public imports via `@/` alias.
- UI changes must be validated in a real browser in **both light and dark themes**; PR description needs screenshots.
- Do not add npm packages by editing package.json; use `bun add`. (This plan adds none.)

---

## File Structure

**Phase A — contract change, in place** (under `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/`):

- `types.ts` — add `AskUserSubmitHandler` type; re-export `AskUserBridgeResponse`.
- `contexts/AskUserSubmitContext/` — **new** context replacing `SessionIdContext` as what `RenderItem` reads.
  - `AskUserSubmitContext.ts`, `index.ts`
- `StreamingMessageDisplay.tsx` — swap `sessionId` prop → `onAskUserSubmit` prop; provide `AskUserSubmitContext` instead of `SessionIdContext`.
- `index.ts` — export `AskUserSubmitHandler`, `AskUserBridgeResponse`.
- `components/MessageList/components/RenderItem/RenderItem.tsx` — read `AskUserSubmitContext` instead of `SessionIdContext`; pass handler (or its absence) to `AskUserCard`.
- `components/MessageList/components/AskUserCard/` — accept `onSubmit` handler prop instead of `sessionId`; own error handling; disabled+notice state when handler absent.
  - `AskUserCard.tsx`, `AskUserCardView.tsx`, `hooks/useSubmitActions.ts`, `types.ts`
- `components/MessageList/components/SubagentDisclosure/SubagentDisclosureView.tsx` — recurse with no `sessionId`/no `onAskUserSubmit`.
- `contexts/SessionIdContext/` — **deleted**.

**Logic layer (consumers), Phase A:**

- `apps/frontend/src/pages/chat/ChatPageView.tsx` + `ChatPage.tsx` — drop `sessionId` to stream; pass `onAskUserSubmit` closing over `submitToolResponse` + `sessionId`.
- `apps/frontend/src/pages/coding/CodingPageView.tsx` + `CodingPage.tsx` — same.
- `apps/frontend/src/api/chat/chat.ts`, `apps/frontend/src/api/coding/coding.ts` — `submitToolResponse` already exists; no change needed (verified).

**Phase B — physical move:**

- Move `modules/chat-session/components/StreamingMessageDisplay/` → `modules/chat-stream/` (new module), plus `components/UsageInfo/` (used internally by `SubagentDisclosure`).
- Update all chat-session imports that reference `components/StreamingMessageDisplay/` and `components/UsageInfo/`.
- `modules/chat-stream/index.ts` — module public entry.

**Follow-up (this plan, doc only):** open a GitHub issue for the `AskUserCard` disabled-state UI polish; leave a `TODO(#<issue>)` in code.

---

## Phase A — Contract Change (in place)

### Task A0: Extract `thinking-level` label helper (remove duplicated label map)

`THINKING_LEVEL_LABELS` (a `ThinkingLevel`→label map) and its derived `THINKING_LEVELS` array live in `chat-session/constants.ts`. They are used by `UsageInfoView` (which will move into chat-stream) **and** `ThinkingLevelSelect` (which stays in chat-session). To avoid two modules carrying duplicate label data after the move — and to avoid a cross-module dependency — extract a single app-level helper now. The `chat-session/index.ts` re-export of these constants has **no external consumers** (verified), so it is dead and can be deleted.

**Files:**

- Create: `apps/frontend/src/helpers/thinking-level.ts`
- Test: `apps/frontend/src/helpers/thinking-level.test.ts`
- Modify: `apps/frontend/src/modules/chat-session/components/ThinkingLevelSelect/ThinkingLevelSelect.tsx`
- Modify: `apps/frontend/src/modules/chat-session/components/UsageInfo/UsageInfoView.tsx`
- Modify: `apps/frontend/src/modules/chat-session/index.ts` (remove dead re-export line)
- Delete: `apps/frontend/src/modules/chat-session/constants.ts` (becomes empty)

**Interfaces:**

- Produces:
  - `getThinkingLevelLabel(level: ThinkingLevel): string`
  - `getThinkingLevelOptions(): readonly [ThinkingLevel, string][]` (all levels as `[level, label]` pairs, in display order)
  - both exported from `@/helpers/thinking-level.js`.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/helpers/thinking-level.test.ts`:

```ts
import {describe, expect, it} from 'vitest';

import {
  getThinkingLevelLabel,
  getThinkingLevelOptions,
} from './thinking-level.js';

describe('getThinkingLevelLabel', () => {
  it('maps each level to its display label', () => {
    expect(getThinkingLevelLabel('none')).toBe('None');
    expect(getThinkingLevelLabel('low')).toBe('Low');
    expect(getThinkingLevelLabel('medium')).toBe('Medium');
    expect(getThinkingLevelLabel('high')).toBe('High');
    expect(getThinkingLevelLabel('xhigh')).toBe('Extra High');
  });
});

describe('getThinkingLevelOptions', () => {
  it('returns all levels as [level, label] pairs in display order', () => {
    expect(getThinkingLevelOptions()).toEqual([
      ['none', 'None'],
      ['low', 'Low'],
      ['medium', 'Medium'],
      ['high', 'High'],
      ['xhigh', 'Extra High'],
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun run test src/helpers/thinking-level.test.ts`
Expected: FAIL — module `./thinking-level.js` does not exist.

- [ ] **Step 3: Create the helper**

`apps/frontend/src/helpers/thinking-level.ts`:

```ts
import type {ThinkingLevel} from '@omnicraft/api-schema';

const THINKING_LEVEL_LABELS: Record<ThinkingLevel, string> = {
  none: 'None',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra High',
};

/** Display label for a thinking level. Single source of truth for all UI. */
export function getThinkingLevelLabel(level: ThinkingLevel): string {
  return THINKING_LEVEL_LABELS[level];
}

/** All thinking levels as [level, label] pairs, in display order. For
 *  rendering selectable lists. */
export function getThinkingLevelOptions(): readonly [ThinkingLevel, string][] {
  return Object.entries(THINKING_LEVEL_LABELS) as [ThinkingLevel, string][];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun run test src/helpers/thinking-level.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Update `ThinkingLevelSelect.tsx`**

Replace the constants import (line 5) and the two usages:

```ts
// import line
import {
  getThinkingLevelLabel,
  getThinkingLevelOptions,
} from '@/helpers/thinking-level.js';
```

```tsx
// trigger label (was THINKING_LEVEL_LABELS[value])
{
  `Thinking: ${getThinkingLevelLabel(value)}`;
}
```

```tsx
// options list (was THINKING_LEVELS.map(...))
{
  getThinkingLevelOptions().map(([id, label]) => (
    <ListBox.Item key={id} id={id} textValue={label}>
      {label}
      <ListBox.ItemIndicator />
    </ListBox.Item>
  ));
}
```

- [ ] **Step 6: Update `UsageInfoView.tsx`**

Replace the constants import (line 4) and the usage (line 34):

```ts
import {getThinkingLevelLabel} from '@/helpers/thinking-level.js';
```

```tsx
Thinking: {
  getThinkingLevelLabel(usage.thinkingLevel);
}
```

- [ ] **Step 7: Remove the dead re-export and delete the empty constants file**

In `apps/frontend/src/modules/chat-session/index.ts`, delete the line:

```ts
export {THINKING_LEVEL_LABELS, THINKING_LEVELS} from './constants.js';
```

Then delete the now-empty file:

```bash
git rm apps/frontend/src/modules/chat-session/constants.ts
```

- [ ] **Step 8: Typecheck + run affected tests**

Run: `cd apps/frontend && bunx tsc --noEmit && bun run test src/helpers/thinking-level.test.ts src/modules/chat-session/components/ThinkingLevelSelect/ src/modules/chat-session/components/UsageInfo/`
Expected: no type errors; tests PASS. (`tsc` confirms no other file referenced the deleted constants.)

- [ ] **Step 9: Commit**

```bash
git add apps/frontend/src/helpers/thinking-level.ts apps/frontend/src/helpers/thinking-level.test.ts apps/frontend/src/modules/chat-session/components/ThinkingLevelSelect/ThinkingLevelSelect.tsx apps/frontend/src/modules/chat-session/components/UsageInfo/UsageInfoView.tsx apps/frontend/src/modules/chat-session/index.ts
git commit -m "refactor(frontend): extract thinking-level label helper, drop duplicated map"
```

---

### Task A1: Export precise `AskUserBridgeResponse` type from tool-schemas

The submit `result` must be the exact union, not `unknown`. The schema exists; the inferred type is not exported yet.

**Files:**

- Modify: `packages/tool-schemas/src/parameter-schemas.ts` (after line 226)
- Modify: `packages/tool-schemas/src/index.ts:1-16` (add type export)
- Test: `packages/tool-schemas/src/parameter-schemas.test.ts` (create if absent)

**Interfaces:**

- Produces: `AskUserBridgeResponse = { cancelled: false; answers: { question: string; answer: string | null }[] } | { cancelled: true }` exported from `@omnicraft/tool-schemas`.

- [ ] **Step 1: Write the failing test**

Create `packages/tool-schemas/src/parameter-schemas.test.ts` (or append if it exists):

```ts
import {describe, expect, it} from 'vitest';

import {askUserBridgeResponseSchema} from './parameter-schemas.js';
import type {AskUserBridgeResponse} from './parameter-schemas.js';

describe('askUserBridgeResponseSchema', () => {
  it('accepts a non-cancelled response with answers', () => {
    const value: AskUserBridgeResponse = {
      cancelled: false,
      answers: [{question: 'q', answer: 'a'}],
    };
    expect(askUserBridgeResponseSchema.parse(value)).toEqual(value);
  });

  it('accepts a cancelled response', () => {
    const value: AskUserBridgeResponse = {cancelled: true};
    expect(askUserBridgeResponseSchema.parse(value)).toEqual(value);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/tool-schemas && bun run test src/parameter-schemas.test.ts`
Expected: FAIL — `AskUserBridgeResponse` is not exported (type import error / `bunx tsc` reports missing export).

- [ ] **Step 3: Add the inferred type export**

In `packages/tool-schemas/src/parameter-schemas.ts`, after the schema (line 226), add:

```ts
export type AskUserBridgeResponse = z.infer<typeof askUserBridgeResponseSchema>;
```

In `packages/tool-schemas/src/index.ts`, add to the existing `export type { ... }` block (the one currently exporting `AnyToolResultData` etc.) a new line, or extend the value-export block with a type re-export:

```ts
export type {AskUserBridgeResponse} from './parameter-schemas.js';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/tool-schemas && bun run test src/parameter-schemas.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck the package**

Run: `cd packages/tool-schemas && bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/tool-schemas/src/parameter-schemas.ts packages/tool-schemas/src/index.ts packages/tool-schemas/src/parameter-schemas.test.ts
git commit -m "feat(tool-schemas): export AskUserBridgeResponse type"
```

---

### Task A2: Add `AskUserSubmitHandler` type and `AskUserSubmitContext`

Define the callback contract and the stream-local context that will carry it to `RenderItem` (replacing `SessionIdContext`).

**Files:**

- Modify: `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/types.ts`
- Create: `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/contexts/AskUserSubmitContext/AskUserSubmitContext.ts`
- Create: `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/contexts/AskUserSubmitContext/index.ts`

**Interfaces:**

- Consumes: `AskUserBridgeResponse` from `@omnicraft/tool-schemas` (Task A1).
- Produces:
  - `AskUserSubmitHandler = (callId: string, result: AskUserBridgeResponse) => void` (exported from stream `types.ts`).
  - `AskUserSubmitContext = React.Context<AskUserSubmitHandler | null>` (default `null` = no submit capability).

- [ ] **Step 1: Add the handler type to `types.ts`**

In `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/types.ts`, add the import near the top (with other `@omnicraft/tool-schemas` usage) and the type after the `ChatEventBus` definition at the end:

```ts
import type {AskUserBridgeResponse} from '@omnicraft/tool-schemas';

// ... existing content ...

/** Handles the user's response to an ask_user tool call within the stream.
 *  Fire-and-forget: the result of the submission surfaces via subsequent SSE
 *  events (the running card is replaced by a done/error card). */
export type AskUserSubmitHandler = (
  callId: string,
  result: AskUserBridgeResponse,
) => void;
```

- [ ] **Step 2: Create the context**

`apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/contexts/AskUserSubmitContext/AskUserSubmitContext.ts`:

```ts
import {createContext} from 'react';

import type {AskUserSubmitHandler} from '../../types.js';

/** null means this stream has no submit capability — ask_user cards render
 *  read-only/disabled. */
export const AskUserSubmitContext = createContext<AskUserSubmitHandler | null>(
  null,
);
```

`apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/contexts/AskUserSubmitContext/index.ts`:

```ts
export {AskUserSubmitContext} from './AskUserSubmitContext.js';
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/frontend && bunx tsc --noEmit`
Expected: no errors (the new type/context are not yet consumed; this just confirms they compile).

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/types.ts apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/contexts/AskUserSubmitContext/
git commit -m "feat(chat-stream): add AskUserSubmitHandler type and context"
```

---

### Task A3: Rewire `AskUserCard` to accept an injected submit handler

Replace `useChatSessionApi()` + `sessionId` with an injected `onSubmit` handler. The card owns its own error handling. When the handler is absent, the form is disabled with a notice.

**Files:**

- Modify: `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/AskUserCard/AskUserCard.tsx`
- Modify: `.../AskUserCard/hooks/useSubmitActions.ts`
- Modify: `.../AskUserCard/AskUserCardView.tsx`
- Test: `.../AskUserCard/hooks/useSubmitActions.test.ts` (create)

**Interfaces:**

- Consumes: `AskUserSubmitHandler` (A2), `AskUserBridgeResponse` (A1).
- Produces: `AskUserCard` now takes `onSubmit: AskUserSubmitHandler | null` instead of `sessionId`. `useSubmitActions` takes `{callId, collectAnswers, onSubmit}` and exposes the existing `SubmitActions` shape `{submitting, handleSubmit, handleCancel}` plus `canSubmit: boolean`.

- [ ] **Step 1: Write the failing test for `useSubmitActions`**

Create `.../AskUserCard/hooks/useSubmitActions.test.ts`:

```ts
import {act, renderHook} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';

import {useSubmitActions} from './useSubmitActions.js';

describe('useSubmitActions', () => {
  it('calls onSubmit with collected answers on submit', () => {
    const onSubmit = vi.fn();
    const collectAnswers = () => [{question: 'q', answer: 'a'}];
    const {result} = renderHook(() =>
      useSubmitActions({callId: 'c1', collectAnswers, onSubmit}),
    );

    act(() => {
      result.current.handleSubmit();
    });

    expect(onSubmit).toHaveBeenCalledWith('c1', {
      cancelled: false,
      answers: [{question: 'q', answer: 'a'}],
    });
  });

  it('calls onSubmit with cancelled on cancel', () => {
    const onSubmit = vi.fn();
    const {result} = renderHook(() =>
      useSubmitActions({callId: 'c1', collectAnswers: () => [], onSubmit}),
    );

    act(() => {
      result.current.handleCancel();
    });

    expect(onSubmit).toHaveBeenCalledWith('c1', {cancelled: true});
  });

  it('reports canSubmit=false when no handler is provided', () => {
    const {result} = renderHook(() =>
      useSubmitActions({
        callId: 'c1',
        collectAnswers: () => [],
        onSubmit: null,
      }),
    );

    expect(result.current.canSubmit).toBe(false);
    act(() => {
      result.current.handleSubmit();
    });
    // no throw; nothing to assert beyond not crashing
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun run test src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/AskUserCard/hooks/useSubmitActions.test.ts`
Expected: FAIL — current `useSubmitActions` signature takes `sessionId` and calls `submitToolResponse`, so the new param shape won't compile / behaves differently.

- [ ] **Step 3: Rewrite `useSubmitActions.ts`**

Replace the file contents:

```ts
import {useCallback, useState} from 'react';

import type {AskUserSubmitHandler} from '../../../../../../types.js';
import type {AnswerEntry} from '../types.js';

interface UseSubmitActionsParams {
  callId: string;
  collectAnswers: () => AnswerEntry[];
  onSubmit: AskUserSubmitHandler | null;
}

export interface SubmitActions {
  submitting: boolean;
  canSubmit: boolean;
  handleSubmit: () => void;
  handleCancel: () => void;
}

/** Submits or cancels the questionnaire via the injected handler. Fire-and-
 *  forget: the outcome surfaces through subsequent SSE events. When no handler
 *  is provided the stream cannot accept submissions.
 *  TODO(#<issue>): refine disabled-state UI for the no-handler case. */
export function useSubmitActions({
  callId,
  collectAnswers,
  onSubmit,
}: UseSubmitActionsParams): SubmitActions {
  const [submitting, setSubmitting] = useState(false);
  const canSubmit = onSubmit !== null;

  const handleSubmit = useCallback(() => {
    if (submitting || onSubmit === null) return;
    setSubmitting(true);
    onSubmit(callId, {cancelled: false, answers: collectAnswers()});
  }, [callId, collectAnswers, submitting, onSubmit]);

  const handleCancel = useCallback(() => {
    if (submitting || onSubmit === null) return;
    setSubmitting(true);
    onSubmit(callId, {cancelled: true});
  }, [callId, submitting, onSubmit]);

  return {submitting, canSubmit, handleSubmit, handleCancel};
}
```

> Note: `AnswerEntry` is `{question: string; answer: string | null}` (from `AskUserCard/types.ts`), which matches the `answers` element type of `AskUserBridgeResponse` — so `{cancelled: false, answers: collectAnswers()}` is exactly `AskUserBridgeResponse`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun run test src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/AskUserCard/hooks/useSubmitActions.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Update `AskUserCard.tsx` to take `onSubmit` instead of `sessionId`**

Replace the props union and the `useSubmitActions` call. New file:

```ts
import type {ToolFailureData, ToolResultData} from '@omnicraft/tool-schemas';

import type {AskUserSubmitHandler} from '../../../../types.js';
import {AskUserCardView} from './AskUserCardView.js';
import {useFormState} from './hooks/useFormState.js';
import {useQuestions} from './hooks/useQuestions.js';
import {useSubmitActions} from './hooks/useSubmitActions.js';

type AskUserCardProps =
  | {onSubmit: AskUserSubmitHandler | null; callId: string; arguments: string; status: 'running'}
  | {
      onSubmit: AskUserSubmitHandler | null;
      callId: string;
      arguments: string;
      status: 'done';
      data: ToolResultData<'ask_user'>;
    }
  | {
      onSubmit: AskUserSubmitHandler | null;
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
    onSubmit: props.onSubmit,
  });

  const completedAnswers = props.status === 'done' ? props.data.answers : null;

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

- [ ] **Step 6: Update `AskUserCardView.tsx` for the disabled-no-handler state**

In the running-state render (the final `return`), disable the form and show a notice when `!submitActions.canSubmit`. Change the `disabled` line and footer:

```tsx
const disabled = submitActions.submitting || !submitActions.canSubmit;

return (
  <div className={styles.card}>
    <div className={styles.header}>
      <MessageCircleQuestion size={16} className={styles.headerIcon} />
      <span className={styles.headerTitle}>Questions from Assistant</span>
    </div>
    <div className={styles.body}>
      {questions.map((q, i) => (
        <Fragment key={q.question}>
          {i > 0 && <Separator />}
          <QuestionItem
            question={q}
            index={i}
            formState={formState}
            disabled={disabled}
          />
        </Fragment>
      ))}
    </div>
    {/* TODO(#<issue>): polish the disabled-state UI for sessions that cannot
          accept form submission. */}
    {!submitActions.canSubmit && (
      <p className={styles.disabledNotice}>
        This session does not support form submission.
      </p>
    )}
    <div className={styles.footer}>
      <Button
        variant='ghost'
        isDisabled={disabled}
        onPress={submitActions.handleCancel}
      >
        Cancel
      </Button>
      <Button
        variant='primary'
        isDisabled={disabled}
        onPress={submitActions.handleSubmit}
      >
        {submitActions.submitting ? <Spinner size='sm' /> : 'Submit'}
      </Button>
    </div>
  </div>
);
```

Add the notice style to `.../AskUserCard/styles.module.css`:

```css
.disabledNotice {
  margin: 0;
  padding: 0 12px;
  font-size: 0.85em;
  color: var(--muted);
}
```

- [ ] **Step 7: Run the AskUserCard-related tests + typecheck**

Run: `cd apps/frontend && bun run test src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/AskUserCard/ && bunx tsc --noEmit`
Expected: PASS for the hook test. `tsc` will still report errors in `RenderItem.tsx` (still passes `sessionId`) — that is fixed in A4. Confirm the only remaining errors are about `RenderItem` passing `sessionId`/missing `onSubmit`.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/AskUserCard/
git commit -m "refactor(chat-stream): inject ask_user submit handler, own error handling"
```

---

### Task A4: Swap `SessionIdContext` → `AskUserSubmitContext` in the stream entry + RenderItem

Provide the handler at the stream root and read it in `RenderItem`; delete `SessionIdContext`.

**Files:**

- Modify: `.../StreamingMessageDisplay/StreamingMessageDisplay.tsx`
- Modify: `.../StreamingMessageDisplay/components/MessageList/components/RenderItem/RenderItem.tsx`
- Modify: `.../StreamingMessageDisplay/components/MessageList/components/RenderItem/RenderItem.test.tsx`
- Modify: `.../StreamingMessageDisplay/index.ts`
- Delete: `.../StreamingMessageDisplay/contexts/SessionIdContext/` (both files)

**Interfaces:**

- Consumes: `AskUserSubmitContext` (A2), `AskUserCard` new props (A3).
- Produces: `StreamingMessageDisplay` public props become `{eventBus, onAskUserSubmit?, onMessagesChange?}` (no `sessionId`).

- [ ] **Step 1: Update `StreamingMessageDisplay.tsx`**

```tsx
import {useEffect, useLayoutEffect, useRef} from 'react';

import {ChatEventBusProvider} from './contexts/ChatEventBusContext/index.js';
import {AskUserSubmitContext} from './contexts/AskUserSubmitContext/index.js';
import {ToolOutputProvider} from './contexts/ToolOutputContext/index.js';
import {useMessages} from './hooks/useMessages.js';
import {StreamingMessageDisplayView} from './StreamingMessageDisplayView.js';
import type {AskUserSubmitHandler, ChatEventBus, ChatMessage} from './types.js';

interface StreamingMessageDisplayProps {
  eventBus: ChatEventBus;
  onAskUserSubmit?: AskUserSubmitHandler;
  onMessagesChange?: (messages: readonly ChatMessage[]) => void;
}

export function StreamingMessageDisplay({
  eventBus,
  onAskUserSubmit,
  onMessagesChange,
}: StreamingMessageDisplayProps) {
  return (
    <ChatEventBusProvider eventBus={eventBus}>
      <AskUserSubmitContext value={onAskUserSubmit ?? null}>
        <ToolOutputProvider>
          <StreamingMessageDisplayInner onMessagesChange={onMessagesChange} />
        </ToolOutputProvider>
      </AskUserSubmitContext>
    </ChatEventBusProvider>
  );
}

function StreamingMessageDisplayInner({
  onMessagesChange,
}: {
  onMessagesChange?: (messages: readonly ChatMessage[]) => void;
}) {
  const {messages} = useMessages();
  const callbackRef = useRef(onMessagesChange);
  useLayoutEffect(() => {
    callbackRef.current = onMessagesChange;
  });

  useEffect(() => {
    callbackRef.current?.(messages);
  }, [messages]);

  return <StreamingMessageDisplayView messages={messages} />;
}
```

- [ ] **Step 2: Update `RenderItem.tsx`**

Replace the `SessionIdContext` import and the ask_user branch. Change import (line 5):

```ts
import {AskUserSubmitContext} from '../../../../contexts/AskUserSubmitContext/index.js';
```

Replace the `tool-execution` ask_user block (lines 47-91) so it reads the handler and no longer gates on `sessionId === null`:

```tsx
    case 'tool-execution': {
      if (item.toolName === TOOL_NAME.ASK_USER) {
        const onAskUserSubmit = use(AskUserSubmitContext);
        if (item.status === 'running') {
          return (
            <div className={styles.assistantMessage}>
              <AskUserCard
                onSubmit={onAskUserSubmit}
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
                onSubmit={onAskUserSubmit}
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
              onSubmit={onAskUserSubmit}
              callId={item.callId}
              arguments={item.arguments}
              status={item.status}
              data={item.data}
            />
          </div>
        );
      }
      return (
        <div className={clsx(styles.assistantMessage, styles.fullWidthMessage)}>
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
    }
```

> The old code returned `null` when `sessionId === null` during session transitions. That guard was a workaround tied to `sessionId`; the `reset-session` event already clears messages, so the transient case is handled upstream. Removing it is intended.

- [ ] **Step 3: Update `RenderItem.test.tsx`**

Open the test and replace any `SessionIdContext` provider wrapper with `AskUserSubmitContext`. Find the wrapper (it currently provides a `sessionId` string) and change to provide a handler. Concretely, replace:

```tsx
import {SessionIdContext} from '../../../../contexts/SessionIdContext/index.js';
// ...
<SessionIdContext value='session-1'>{children}</SessionIdContext>;
```

with:

```tsx
import {AskUserSubmitContext} from '../../../../contexts/AskUserSubmitContext/index.js';
// ...
<AskUserSubmitContext value={() => undefined}>{children}</AskUserSubmitContext>;
```

If the test asserted the ask_user-null-session returns null, remove that assertion (behavior intentionally changed). Keep all other assertions.

- [ ] **Step 4: Update stream `index.ts` exports**

```ts
export {StreamingMessageDisplay} from './StreamingMessageDisplay.js';
export type {
  AskUserSubmitHandler,
  ChatEventBus,
  ChatEventMap,
  ChatMessage,
  MessageContent,
  SubagentContent,
  TextContent,
  ThinkingContent,
} from './types.js';
export type {AskUserBridgeResponse} from '@omnicraft/tool-schemas';
```

- [ ] **Step 5: Delete `SessionIdContext`**

```bash
git rm -r apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/contexts/SessionIdContext/
```

- [ ] **Step 5b: Fix `useStreamChat.test.tsx` stream usage**

`apps/frontend/src/modules/chat-session/hooks/useStreamChat.test.tsx` has a test harness (`HarnessContent`) that renders `<StreamingMessageDisplay eventBus={eventBus} sessionId='session-1' />`. The `sessionId` prop no longer exists on the stream. Remove just that prop:

```tsx
// before
return <StreamingMessageDisplay eventBus={eventBus} sessionId='session-1' />;
// after
return <StreamingMessageDisplay eventBus={eventBus} />;
```

Leave the `useStreamChat({sessionId: 'session-1', ...})` calls untouched — `useStreamChat` is a logic-layer hook that legitimately keeps its own `sessionId` parameter. Only the `StreamingMessageDisplay` JSX prop is removed.

- [ ] **Step 6: Run stream tests + typecheck**

Run: `cd apps/frontend && bun run test src/modules/chat-session/components/StreamingMessageDisplay/ && bunx tsc --noEmit`
Expected: stream-subtree tests PASS. `tsc` will now report errors only in `SubagentDisclosure` (still passes `sessionId={null}`) and the two PageViews (still pass `sessionId`) — fixed in A5/A6.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/
git commit -m "refactor(chat-stream): replace SessionIdContext with AskUserSubmitContext"
```

---

### Task A5: Fix subagent recursion to drop `sessionId`

`SubagentDisclosureView` recurses `<StreamingMessageDisplay sessionId={null} />`. Subagent streams accept no user submission, so they pass neither `sessionId` nor `onAskUserSubmit`.

**Files:**

- Modify: `.../SubagentDisclosure/SubagentDisclosureView.tsx:94`

**Interfaces:**

- Consumes: `StreamingMessageDisplay` new props (A4).

- [ ] **Step 1: Update the recursion**

Change line 94 from:

```tsx
<StreamingMessageDisplay eventBus={eventBus} sessionId={null} />
```

to:

```tsx
<StreamingMessageDisplay eventBus={eventBus} />
```

- [ ] **Step 2: Run subagent test + typecheck**

Run: `cd apps/frontend && bun run test src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/SubagentDisclosure/ && bunx tsc --noEmit`
Expected: subagent test PASS. `tsc` now reports errors only in the two PageViews.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/SubagentDisclosure/SubagentDisclosureView.tsx
git commit -m "refactor(chat-stream): subagent stream passes no sessionId"
```

---

### Task A6: Wire the two pages to inject `onAskUserSubmit`

Both pages currently pass `sessionId` to the stream. Replace with `onAskUserSubmit` closing over `submitToolResponse` (from `useChatSessionApi`) and the page's `sessionId`. The page owns the transport-failure toast.

**Files:**

- Modify: `apps/frontend/src/pages/chat/ChatPageView.tsx` (props + stream usage)
- Modify: `apps/frontend/src/pages/chat/ChatPage.tsx` (build + pass the handler)
- Modify: `apps/frontend/src/pages/coding/CodingPageView.tsx`
- Modify: `apps/frontend/src/pages/coding/CodingPage.tsx`

**Interfaces:**

- Consumes: `StreamingMessageDisplay` props (A4); `AskUserSubmitHandler`, `AskUserBridgeResponse` from `@/modules/chat-session`.
- Produces: pages no longer pass `sessionId` to the stream.

First confirm `useChatSessionApi` is exported from the module entry (it is consumed inside the module today). Check:

Run: `grep -n "useChatSessionApi" apps/frontend/src/modules/chat-session/index.ts`
If absent, add `export {useChatSessionApi} from './hooks/useChatSessionApi.js';` to the module `index.ts` Hooks section as part of Step 1.

- [ ] **Step 1: Build the handler in `ChatPage.tsx`**

In `ChatPageContent`, add `toast` import and the handler. Add to imports:

```ts
import {toast} from '@heroui/react';
import type {AskUserBridgeResponse} from '@omnicraft/tool-schemas';
```

and from the module:

```ts
import {
  // ...existing...
  useChatSessionApi,
} from '@/modules/chat-session/index.js';
```

Inside `ChatPageContent`, after `useSessionId()`:

```ts
const {submitToolResponse} = useChatSessionApi();

const handleAskUserSubmit = useCallback(
  (callId: string, result: AskUserBridgeResponse) => {
    if (sessionId === null) return;
    submitToolResponse(sessionId, callId, result).catch(() => {
      toast.danger('Failed to submit response. Please try again.');
    });
  },
  [sessionId, submitToolResponse],
);
```

Pass it to the view: add `onAskUserSubmit={handleAskUserSubmit}` to the `<ChatPageView ... />` props.

- [ ] **Step 2: Thread it through `ChatPageView.tsx`**

Add to `ChatPageViewProps`:

```ts
  onAskUserSubmit: (callId: string, result: AskUserBridgeResponse) => void;
```

(add the `import type {AskUserBridgeResponse} from '@omnicraft/tool-schemas';`), accept it in the destructure, and change the stream usage:

```tsx
<StreamingMessageDisplay
  eventBus={eventBus}
  onAskUserSubmit={onAskUserSubmit}
  onMessagesChange={onMessagesChange}
/>
```

(remove the `sessionId={sessionId}` line). Leave the other `sessionId`-based conditionals in the view (`{sessionId && <BottomBar />}`, the ChatInput branch, empty-state) untouched — those are page layout concerns and `sessionId` is still a `ChatPageViewProps` field used for them.

- [ ] **Step 3: Mirror in `CodingPage.tsx` + `CodingPageView.tsx`**

Same edits: import `toast`, `AskUserBridgeResponse`, `useChatSessionApi`; build `handleAskUserSubmit` identically in `CodingPageContent`; pass `onAskUserSubmit` to `CodingPageView`; add the prop to `CodingPageViewProps`; replace `sessionId={sessionId}` on the stream with `onAskUserSubmit={onAskUserSubmit}`.

- [ ] **Step 4: Typecheck the whole frontend**

Run: `cd apps/frontend && bunx tsc --noEmit`
Expected: **no errors** — the contract change is now complete end to end.

- [ ] **Step 5: Run the full frontend test suite**

Run: `cd apps/frontend && bun run test`
Expected: all PASS.

- [ ] **Step 6: Browser validation (golden path, both themes)**

Start the dev server from repo root (`bun dev`), open the app, and in both light and dark themes:

- Start a chat that triggers an `ask_user` question (or replay a session that has one); submit answers; confirm the running card becomes a done card.
- Confirm a subagent disclosure still renders its nested stream.
  Capture screenshots for the PR.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/pages/chat/ apps/frontend/src/pages/coding/ apps/frontend/src/modules/chat-session/index.ts
git commit -m "refactor(chat): inject onAskUserSubmit from pages, drop sessionId to stream"
```

---

### Task A7: Open follow-up issue and pin the TODO references

Replace the `TODO(#<issue>)` placeholders with a real issue number.

**Files:**

- Modify: `.../AskUserCard/hooks/useSubmitActions.ts` (TODO comment)
- Modify: `.../AskUserCard/AskUserCardView.tsx` (TODO comment)

- [ ] **Step 1: Create the issue**

```bash
gh issue create --title "Polish AskUserCard disabled state for non-submittable sessions" \
  --body "When a chat stream is rendered without an onAskUserSubmit handler (e.g. read-only/archived views, subagent streams), the ask_user form is disabled with a plain notice. Design a proper read-only/disabled visual treatment. Introduced by the stream-library extraction."
```

Note the returned issue number `<N>`.

- [ ] **Step 2: Replace `TODO(#<issue>)` with `TODO(#<N>)`**

Edit both files, replacing `#<issue>` with the actual number.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/AskUserCard/
git commit -m "docs(chat-stream): reference follow-up issue for ask_user disabled UI"
```

---

## Phase B — Physical Move to `modules/chat-stream/`

This phase is **pure relocation + import-path updates**. No behavior changes. Keeping it as separate commits lets a reviewer verify "logic unchanged, only paths moved."

### Task B1: Move the subtree and `UsageInfo` into `modules/chat-stream/`

`UsageInfo` is used inside the stream (`SubagentDisclosureView` imports it) and depends on the stream's `ChatEventBus` type, so it travels with the library.

**Files:**

- Move: `modules/chat-session/components/StreamingMessageDisplay/**` → `modules/chat-stream/**` (the stream becomes the module root; its current `StreamingMessageDisplay.tsx`/`types.ts`/`contexts/`/`hooks/`/`components/` become the module's top level).
- Move: `modules/chat-session/components/UsageInfo/**` → `modules/chat-stream/components/UsageInfo/**`.
- Create: `modules/chat-stream/index.ts`.
- Modify: every file that imported `components/StreamingMessageDisplay/` or `components/UsageInfo/` from within `chat-session`.

**Interfaces:**

- Produces: `@/modules/chat-stream` public entry exporting `StreamingMessageDisplay`, `AskUserSubmitHandler`, `ChatEventBus`, `ChatEventMap`, `ChatMessage`, `MessageContent`, `SubagentContent`, `TextContent`, `ThinkingContent`, `AskUserBridgeResponse`, and `UsageInfo`.

- [ ] **Step 1: Create the new module directory and move with git**

```bash
cd apps/frontend/src/modules
mkdir chat-stream
git mv chat-session/components/StreamingMessageDisplay/* chat-stream/
git mv chat-session/components/UsageInfo chat-stream/components/UsageInfo
rmdir chat-session/components/StreamingMessageDisplay
```

- [ ] **Step 2: Create `modules/chat-stream/index.ts`**

```ts
export {StreamingMessageDisplay} from './StreamingMessageDisplay.js';
export {UsageInfo} from './components/UsageInfo/index.js';
export type {
  AskUserSubmitHandler,
  ChatEventBus,
  ChatEventMap,
  ChatMessage,
  MessageContent,
  SubagentContent,
  TextContent,
  ThinkingContent,
} from './types.js';
export type {AskUserBridgeResponse} from '@omnicraft/tool-schemas';
```

(The old `StreamingMessageDisplay/index.ts` content is now redundant with this; if it was moved to `chat-stream/index.ts` keep this version and delete the moved one.)

- [ ] **Step 3: Fix `UsageInfo` internal imports**

`UsageInfo` previously reached the stream via `../StreamingMessageDisplay/index.js` and `../../StreamingMessageDisplay/index.js` (for `ChatEventBus`), and `../../constants.js` for `THINKING_LEVEL_LABELS` (used only in `UsageInfoView.tsx:4`).

Resolution (no upward import into chat-session — that would break the library's independence):

1. **`ChatEventBus` type** — now comes from `../../types.js` (UsageInfo is at `chat-stream/components/UsageInfo/`, types at `chat-stream/types.ts`).

2. **`THINKING_LEVEL_LABELS`** — already removed in Task A0. `UsageInfoView` now imports `getThinkingLevelLabel` from `@/helpers/thinking-level.js`, an app-level helper with no module coupling. That import is unaffected by the move (it is an `@/` alias path), so **no change is needed here for the label** — just confirm `UsageInfoView` still reads `getThinkingLevelLabel(usage.thinkingLevel)`.

Update the two remaining UsageInfo files for the `ChatEventBus` import:

```ts
// UsageInfo.tsx
import type {ChatEventBus} from '../../types.js';
// hooks/useUsage.ts
import type {ChatEventBus} from '../../types.js';
// UsageInfoView.tsx — unchanged: still imports getThinkingLevelLabel from '@/helpers/thinking-level.js'
```

- [ ] **Step 4: Fix `SubagentDisclosureView` import of `UsageInfo`**

It previously imported `UsageInfo` from `../../../../../UsageInfo/index.js` (reaching up out of the stream into chat-session). Now both live in `chat-stream`. Update the path to the new relative location:

Run: `grep -n "UsageInfo" apps/frontend/src/modules/chat-stream/components/MessageList/components/SubagentDisclosure/SubagentDisclosureView.tsx`

Replace with the correct relative path from `chat-stream/components/MessageList/components/SubagentDisclosure/` to `chat-stream/components/UsageInfo/index.js`:

```ts
import {UsageInfo} from '../../../UsageInfo/index.js';
```

- [ ] **Step 5: Fix `ContextCompactionBlockView`'s `format-token-count` import**

`format-token-count.ts` (a zero-dependency pure helper with its own test) lives at `chat-session/components/UsageInfo/helpers/` and moved into `chat-stream` together with `UsageInfo` in Step 1. It has two consumers, both now inside `chat-stream`: `UsageInfoView` (relative import, already correct) and `ContextCompactionBlockView`, which used an absolute `@/` path into chat-session:

```ts
// before (ContextCompactionBlockView.tsx:6)
import {formatTokenCount} from '@/modules/chat-session/components/UsageInfo/helpers/format-token-count.js';
```

Replace it with the correct relative path from `chat-stream/components/MessageList/components/ContextCompactionBlock/` to `chat-stream/components/UsageInfo/helpers/format-token-count.js`:

```ts
// after
import {formatTokenCount} from '../../../UsageInfo/helpers/format-token-count.js';
```

Verify no consumer outside `chat-stream` still references this helper:

```bash
grep -rn "format-token-count" apps/frontend/src --include='*.ts' --include='*.tsx' | grep -v "modules/chat-stream"
```

Expected: no output (the helper now lives entirely inside chat-stream; chat-session no longer needs it).

- [ ] **Step 6: Update all chat-session consumers of the moved code**

These files imported from `components/StreamingMessageDisplay/`:
`index.ts`, `contexts/ChatEventBusContext/ChatEventBusContext.ts`, `contexts/ChatEventBusContext/ChatEventBusProvider.tsx`, `hooks/useMessageCount.ts`, `hooks/useChatEventBus.ts`, `hooks/useStreamChat.ts`, `hooks/useSessionTitle.ts`, `helpers/subagent-event-bus.ts`, `helpers/route-base-event-to-bus.ts`, and the two helper test files.

For each, replace the relative `./components/StreamingMessageDisplay/index.js` (or deeper) import with `@/modules/chat-stream/index.js`. Example in `chat-session/index.ts`:

```ts
// before
export type {
  ChatEventBus,
  ChatMessage,
} from './components/StreamingMessageDisplay/index.js';
// after
export type {ChatEventBus, ChatMessage} from '@/modules/chat-stream/index.js';
```

Run this to find every site to fix:

```bash
grep -rln "StreamingMessageDisplay\|components/UsageInfo" apps/frontend/src/modules/chat-session
```

Update each to import from `@/modules/chat-stream/index.js` (public types/components only). Also update `InfoBarView.tsx` and `SessionSidebar/hooks/useSessionList.ts` and `UsageInfo`-referencing files flagged by the grep.

- [ ] **Step 7: Update the two PageViews' imports**

`ChatPageView.tsx` / `CodingPageView.tsx` import `StreamingMessageDisplay` (and `ChatEventBus`, `ChatMessage` types) from `@/modules/chat-session/index.js`. Decide: keep re-exporting these from chat-session for compatibility, **or** point pages at `@/modules/chat-stream`. Per the design (stream is its own library), point the stream-specific imports at `@/modules/chat-stream`:

```ts
import {
  StreamingMessageDisplay,
  type ChatEventBus,
  type ChatMessage,
} from '@/modules/chat-stream/index.js';
```

Keep the layout components (`BottomBar`, `ChatAlert`, `ChatInput`, `SessionSidebar`, `TitleBarView`, `chatSessionStyles`) imported from `@/modules/chat-session`.

- [ ] **Step 8: Typecheck**

Run: `cd apps/frontend && bunx tsc --noEmit`
Expected: no errors. Fix any remaining stale relative paths it reports.

- [ ] **Step 9: Run the full test suite**

Run: `cd apps/frontend && bun run test`
Expected: all PASS (tests moved with their files; paths resolved).

- [ ] **Step 10: Commit**

```bash
git add -A apps/frontend/src/modules/chat-stream apps/frontend/src/modules/chat-session apps/frontend/src/pages
git commit -m "refactor: relocate stream library to modules/chat-stream"
```

---

### Task B2: Final verification

- [ ] **Step 1: Full typecheck + tests + lint**

Run: `cd apps/frontend && bunx tsc --noEmit && bun run test`
Expected: clean.

Run from repo root: `bun run lint` (if a root lint script exists; otherwise the pre-commit hook covers staged files).

- [ ] **Step 2: Browser validation (both themes)**

Start `bun dev` from repo root. In light and dark:

- Chat page: send a message, observe streamed assistant text, a tool card, and (if reachable) an ask_user card submit round-trip.
- Coding page: dispatch a task, observe the stream and a subagent disclosure rendering its nested stream.
  Capture screenshots for the PR description.

- [ ] **Step 3: Confirm no orphaned references**

```bash
grep -rn "SessionIdContext" apps/frontend/src/modules/chat-stream || echo "clean: no SessionIdContext in chat-stream"
grep -rn "components/StreamingMessageDisplay" apps/frontend/src || echo "clean: no stale StreamingMessageDisplay paths"
```

Expected: both print the "clean" message.

---

## Self-Review Notes

- **Spec coverage:** placement under `modules/` (B1) ✓; `{eventBus, onAskUserSubmit?, onMessagesChange?}` contract (A4) ✓; `sessionId` + `SessionIdContext` removed (A4) ✓; submit as injected callback (A3) ✓; `callId` from SSE flows through unchanged (A3/A4) ✓; precise `AskUserBridgeResponse` type (A1) ✓; absent-handler ⇒ disabled+notice, history still replays read-only (A3 — done/failure/error branches untouched) ✓; `onMessagesChange` retained (A4) ✓; logic layer keeps `useStreamChat`/routing/`ChatSessionApi` (untouched) ✓; follow-up issue + TODO (A7) ✓.
- **Decision refinement during planning:** `onAskUserSubmit` is fire-and-forget `=> void` (not `Promise`); the AskUserCard owns its own error display; submission outcome surfaces via subsequent SSE. Transport-failure toast handled by the page closure. Captured in A3/A6.
- **Type consistency:** `AskUserSubmitHandler = (callId: string, result: AskUserBridgeResponse) => void` used identically in A2 (def), A3 (consumer), A4 (provider), A6 (page closure). `SubmitActions` gains `canSubmit: boolean` in A3, consumed in A3 Step 6 view.
- **`UsageInfo` cross-module coupling resolved:** The one shared symbol — `THINKING_LEVEL_LABELS`, used by both `UsageInfoView` (moves to chat-stream) and `ThinkingLevelSelect` (stays in chat-session) — is extracted in Task A0 into an app-level helper `@/helpers/thinking-level.js` (`getThinkingLevelLabel` / `getThinkingLevelOptions`). Both modules import the single helper; no duplicated map, no cross-module dependency. `format-token-count` (B1 Step 5) moves wholesale with `UsageInfo` since both its consumers end up in chat-stream.
