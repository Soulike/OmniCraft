# AskUserCard Submission-State Notices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give AskUserCard two dignified degraded-state notices — a quiet permanent one when a session can't accept answers, and a transient danger one when a submission fails (retry via Submit).

**Architecture:** Two small sibling presentational components (`UnsupportedNotice`, `SubmitErrorNotice`) under `AskUserCard/components/`, rendered in one slot between the card body and footer. `useSubmitActions` gains a `submitError` boolean that the view reads; the raw rejection is logged to `console.error` and never shown in the UI.

**Tech Stack:** React 19 (React Compiler), TypeScript, Vite, Vitest + Testing Library, CSS Modules, HeroUI tokens, lucide-react icons.

## Global Constraints

- Tests run with `bun run test` (Vitest). NEVER `bun test` (Bun's runner produces false failures).
- Never use `any`; use `unknown` + narrowing.
- No default exports. Components export via `export {Component} from './Component.js';` in `index.ts`; import siblings through their `index.js`.
- CSS Modules only — no Tailwind utility classes in our own components.
- Use HeroUI/aurora tokens via `var(--…)`; never hard-code colors. `--muted` and `--danger` are the only colors here.
- Copy is **English** (decided): `"This session can't accept answers."` and `"Couldn't reach the server. Try again."`
- Motion is event-driven only (P3): only `SubmitErrorNotice` animates (one-shot fade-in) and must honor `prefers-reduced-motion`. `UnsupportedNotice` is fully static.
- One React component per file; MVVM file layout (`index.ts` + `<Name>.tsx` + `styles.module.css`). These two notices are stateless — no hook/container split needed.
- Spec: `docs/superpowers/specs/2026-06-21-ask-user-submission-notices-design.md`.

---

## File Structure

New:

- `…/AskUserCard/components/UnsupportedNotice/index.ts`
- `…/AskUserCard/components/UnsupportedNotice/UnsupportedNotice.tsx`
- `…/AskUserCard/components/UnsupportedNotice/styles.module.css`
- `…/AskUserCard/components/UnsupportedNotice/UnsupportedNotice.test.tsx`
- `…/AskUserCard/components/SubmitErrorNotice/index.ts`
- `…/AskUserCard/components/SubmitErrorNotice/SubmitErrorNotice.tsx`
- `…/AskUserCard/components/SubmitErrorNotice/styles.module.css`
- `…/AskUserCard/components/SubmitErrorNotice/SubmitErrorNotice.test.tsx`

Modified:

- `…/AskUserCard/hooks/useSubmitActions.ts` — add `submitError`, clear on retry, log raw error.
- `…/AskUserCard/hooks/useSubmitActions.test.ts` — extend.
- `…/AskUserCard/AskUserCardView.tsx` — render the notice slot; remove old `disabledNotice` paragraph + `TODO(#307)` comment.
- `…/AskUserCard/styles.module.css` — remove the unused `.disabledNotice` rule.

`…` = `apps/frontend/src/modules/chat-stream/components/MessageList/components`.

All paths below are written in full.

---

### Task 1: `useSubmitActions` — `submitError` state

**Files:**

- Modify: `apps/frontend/src/modules/chat-stream/components/MessageList/components/AskUserCard/hooks/useSubmitActions.ts`
- Test: `apps/frontend/src/modules/chat-stream/components/MessageList/components/AskUserCard/hooks/useSubmitActions.test.ts`

**Interfaces:**

- Consumes: nothing new.
- Produces: `SubmitActions` interface gains `submitError: boolean`. Full shape after this task:

  ```ts
  interface SubmitActions {
    submitting: boolean;
    submitError: boolean;
    canSubmit: boolean;
    handleSubmit: () => void;
    handleCancel: () => void;
  }
  ```

  Behavior: `submitError` is `false` initially; set `true` when the `onSubmit` promise rejects (for both submit and cancel); reset to `false` at the start of every `handleSubmit`/`handleCancel` call (so a retry clears the prior error). The raw rejection is passed to `console.error` and never surfaced.

- [ ] **Step 1: Add failing tests**

Append these three tests inside the `describe('useSubmitActions', …)` block in `useSubmitActions.test.ts` (before the closing `});`). The file already imports `act, renderHook, waitFor` and `vi`.

```ts
it('exposes submitError=false initially', () => {
  const onSubmit = vi.fn(() => Promise.resolve());
  const {result} = renderHook(() =>
    useSubmitActions({callId: 'c1', collectAnswers: () => [], onSubmit}),
  );

  expect(result.current.submitError).toBe(false);
});

it('sets submitError=true when a submit fails, and logs the raw error', async () => {
  const error = new Error('network');
  const onSubmit = vi.fn(() => Promise.reject(error));
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  const {result} = renderHook(() =>
    useSubmitActions({callId: 'c1', collectAnswers: () => [], onSubmit}),
  );

  act(() => {
    result.current.handleSubmit();
  });

  await waitFor(() => {
    expect(result.current.submitError).toBe(true);
  });
  expect(consoleError).toHaveBeenCalledWith('ask_user submit failed', error);
  consoleError.mockRestore();
});

it('clears submitError when the user submits again', async () => {
  let attempt = 0;
  const onSubmit = vi.fn(() => {
    attempt += 1;
    return attempt === 1
      ? Promise.reject(new Error('network'))
      : Promise.resolve();
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const {result} = renderHook(() =>
    useSubmitActions({callId: 'c1', collectAnswers: () => [], onSubmit}),
  );

  act(() => {
    result.current.handleSubmit();
  });
  await waitFor(() => {
    expect(result.current.submitError).toBe(true);
  });

  act(() => {
    result.current.handleSubmit();
  });
  expect(result.current.submitError).toBe(false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test useSubmitActions`
Expected: FAIL — the three new tests fail (`submitError` is `undefined`); the existing tests still pass.

- [ ] **Step 3: Implement `submitError`**

Replace the body of `useSubmitActions.ts` from the `SubmitActions` interface through the end with the version below. Changes: add `submitError` to the interface, add the state, reset + set it in both handlers, log the raw error, and update the docstring (drop the `TODO(#307)`).

```ts
export interface SubmitActions {
  submitting: boolean;
  submitError: boolean;
  canSubmit: boolean;
  handleSubmit: () => void;
  handleCancel: () => void;
}

/** Submits or cancels the questionnaire via the injected handler. The handler
 *  returns a promise; on rejection the submitting state is reset and
 *  submitError is raised so the card can show a retry notice. The raw error is
 *  logged to the console (never surfaced in the UI). Pressing submit/cancel
 *  again clears the prior error before re-sending. When no handler is provided
 *  the stream cannot accept submissions. */
export function useSubmitActions({
  callId,
  collectAnswers,
  onSubmit,
}: UseSubmitActionsParams): SubmitActions {
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const canSubmit = onSubmit !== null;

  const handleSubmit = useCallback(() => {
    if (submitting || onSubmit === null) return;
    setSubmitting(true);
    setSubmitError(false);
    onSubmit(callId, {cancelled: false, answers: collectAnswers()}).catch(
      (error: unknown) => {
        console.error('ask_user submit failed', error);
        setSubmitting(false);
        setSubmitError(true);
      },
    );
  }, [callId, collectAnswers, submitting, onSubmit]);

  const handleCancel = useCallback(() => {
    if (submitting || onSubmit === null) return;
    setSubmitting(true);
    setSubmitError(false);
    onSubmit(callId, {cancelled: true}).catch((error: unknown) => {
      console.error('ask_user cancel failed', error);
      setSubmitting(false);
      setSubmitError(true);
    });
  }, [callId, submitting, onSubmit]);

  return {submitting, submitError, canSubmit, handleSubmit, handleCancel};
}
```

Leave the imports and `UseSubmitActionsParams` interface at the top of the file unchanged.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run test useSubmitActions`
Expected: PASS — all tests (existing + 3 new) green.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/modules/chat-stream/components/MessageList/components/AskUserCard/hooks/useSubmitActions.ts apps/frontend/src/modules/chat-stream/components/MessageList/components/AskUserCard/hooks/useSubmitActions.test.ts
git commit -m "feat(ask-user): track submitError in useSubmitActions"
```

---

### Task 2: `UnsupportedNotice` component

**Files:**

- Create: `apps/frontend/src/modules/chat-stream/components/MessageList/components/AskUserCard/components/UnsupportedNotice/UnsupportedNotice.tsx`
- Create: `apps/frontend/src/modules/chat-stream/components/MessageList/components/AskUserCard/components/UnsupportedNotice/styles.module.css`
- Create: `apps/frontend/src/modules/chat-stream/components/MessageList/components/AskUserCard/components/UnsupportedNotice/index.ts`
- Test: `apps/frontend/src/modules/chat-stream/components/MessageList/components/AskUserCard/components/UnsupportedNotice/UnsupportedNotice.test.tsx`

**Interfaces:**

- Consumes: nothing.
- Produces: `UnsupportedNotice` — a no-prop component exported as `export {UnsupportedNotice} from './UnsupportedNotice.js';`. Renders one static muted row: `Info` icon (16px) + the copy `"This session can't accept answers."`.

- [ ] **Step 1: Write the failing test**

Create `UnsupportedNotice.test.tsx`:

```tsx
import {render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';

import {UnsupportedNotice} from './index.js';

describe('UnsupportedNotice', () => {
  it('renders the unsupported-session copy', () => {
    render(<UnsupportedNotice />);

    expect(
      screen.getByText("This session can't accept answers."),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test UnsupportedNotice`
Expected: FAIL — cannot resolve `./index.js` / `UnsupportedNotice` is not defined.

- [ ] **Step 3: Create the component, styles, and barrel**

Create `styles.module.css`:

```css
.notice {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  font-size: 0.8125rem;
  line-height: 1.5;
  color: var(--muted);
}

.icon {
  flex-shrink: 0;
  color: var(--muted);
}
```

Create `UnsupportedNotice.tsx`:

```tsx
import {Info} from 'lucide-react';

import styles from './styles.module.css';

const ICON_SIZE = 16;

export function UnsupportedNotice() {
  return (
    <div className={styles.notice}>
      <Info size={ICON_SIZE} className={styles.icon} />
      <span>This session can&apos;t accept answers.</span>
    </div>
  );
}
```

Create `index.ts`:

```ts
export {UnsupportedNotice} from './UnsupportedNotice.js';
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test UnsupportedNotice`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/modules/chat-stream/components/MessageList/components/AskUserCard/components/UnsupportedNotice
git commit -m "feat(ask-user): add UnsupportedNotice component"
```

---

### Task 3: `SubmitErrorNotice` component

**Files:**

- Create: `apps/frontend/src/modules/chat-stream/components/MessageList/components/AskUserCard/components/SubmitErrorNotice/SubmitErrorNotice.tsx`
- Create: `apps/frontend/src/modules/chat-stream/components/MessageList/components/AskUserCard/components/SubmitErrorNotice/styles.module.css`
- Create: `apps/frontend/src/modules/chat-stream/components/MessageList/components/AskUserCard/components/SubmitErrorNotice/index.ts`
- Test: `apps/frontend/src/modules/chat-stream/components/MessageList/components/AskUserCard/components/SubmitErrorNotice/SubmitErrorNotice.test.tsx`

**Interfaces:**

- Consumes: nothing.
- Produces: `SubmitErrorNotice` — a no-prop component exported as `export {SubmitErrorNotice} from './SubmitErrorNotice.js';`. Renders one danger-toned row with a faint danger tint block: `TriangleAlert` icon (16px) + the copy `"Couldn't reach the server. Try again."`, with a one-shot fade-in that snaps under `prefers-reduced-motion`.

- [ ] **Step 1: Write the failing test**

Create `SubmitErrorNotice.test.tsx`:

```tsx
import {render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';

import {SubmitErrorNotice} from './index.js';

describe('SubmitErrorNotice', () => {
  it('renders the submit-failure copy', () => {
    render(<SubmitErrorNotice />);

    expect(
      screen.getByText("Couldn't reach the server. Try again."),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test SubmitErrorNotice`
Expected: FAIL — cannot resolve `./index.js` / `SubmitErrorNotice` is not defined.

- [ ] **Step 3: Create the component, styles, and barrel**

Create `styles.module.css`:

```css
.notice {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 4px 16px;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 0.8125rem;
  line-height: 1.5;
  color: var(--danger);
  background: color-mix(in oklch, var(--danger) 6%, transparent);
  animation: notice-fade-in 150ms ease-out;
}

.icon {
  flex-shrink: 0;
  color: var(--danger);
}

@keyframes notice-fade-in {
  from {
    opacity: 0;
    transform: translateY(-2px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .notice {
    animation: none;
  }
}
```

Create `SubmitErrorNotice.tsx`:

```tsx
import {TriangleAlert} from 'lucide-react';

import styles from './styles.module.css';

const ICON_SIZE = 16;

export function SubmitErrorNotice() {
  return (
    <div className={styles.notice} role='alert'>
      <TriangleAlert size={ICON_SIZE} className={styles.icon} />
      <span>Couldn&apos;t reach the server. Try again.</span>
    </div>
  );
}
```

Create `index.ts`:

```ts
export {SubmitErrorNotice} from './SubmitErrorNotice.js';
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test SubmitErrorNotice`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/modules/chat-stream/components/MessageList/components/AskUserCard/components/SubmitErrorNotice
git commit -m "feat(ask-user): add SubmitErrorNotice component"
```

---

### Task 4: Wire the notices into `AskUserCardView`

**Files:**

- Modify: `apps/frontend/src/modules/chat-stream/components/MessageList/components/AskUserCard/AskUserCardView.tsx`
- Modify: `apps/frontend/src/modules/chat-stream/components/MessageList/components/AskUserCard/styles.module.css`

**Interfaces:**

- Consumes: `UnsupportedNotice` (Task 2), `SubmitErrorNotice` (Task 3), `submitActions.submitError` + `submitActions.canSubmit` (Task 1).
- Produces: nothing new (final wiring).

This task has no unit test — it's a render-wiring change verified in Task 5's browser pass. The notice components and the hook are already unit-tested.

- [ ] **Step 1: Replace the notice block in `AskUserCardView.tsx`**

Add the two imports near the other component imports (after the `CompletedCard` / `QuestionItem` imports):

```tsx
import {SubmitErrorNotice} from './components/SubmitErrorNotice/index.js';
import {UnsupportedNotice} from './components/UnsupportedNotice/index.js';
```

Then replace this block (the `{/* TODO(#307) … */}` comment plus the `disabledNotice` paragraph):

```tsx
{
  /* TODO(#307): polish the disabled-state UI for sessions that cannot
            accept form submission. */
}
{
  !submitActions.canSubmit && (
    <p className={styles.disabledNotice}>
      This session does not support form submission.
    </p>
  );
}
```

with:

```tsx
{
  !submitActions.canSubmit && <UnsupportedNotice />;
}
{
  submitActions.canSubmit && submitActions.submitError && <SubmitErrorNotice />;
}
```

(Leave the surrounding `.body` map and the `.footer` block unchanged. The slot stays between the questions `<div className={styles.body}>…</div>` and the `<div className={styles.footer}>`.)

- [ ] **Step 2: Remove the dead `.disabledNotice` rule**

In `AskUserCard/styles.module.css`, delete the entire `.disabledNotice` block (the last rule in the file):

```css
.disabledNotice {
  margin: 0;
  padding: 0 12px;
  font-size: 0.85em;
  color: var(--muted);
}
```

- [ ] **Step 3: Type-check**

Run: `cd apps/frontend && bunx tsc -b`
Expected: exit 0, no errors. (Confirms `submitError` is on `SubmitActions` and both notice imports resolve.)

- [ ] **Step 4: Lint the touched files**

Run: `cd apps/frontend && bunx eslint src/modules/chat-stream/components/MessageList/components/AskUserCard`
Expected: exit 0, no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/modules/chat-stream/components/MessageList/components/AskUserCard/AskUserCardView.tsx apps/frontend/src/modules/chat-stream/components/MessageList/components/AskUserCard/styles.module.css
git commit -m "feat(ask-user): show unsupported/submit-error notices in the card"
```

---

### Task 5: Browser verification (both themes)

**Files:**

- Use (do not commit): the temporary `/preview` route at `apps/frontend/src/pages/_preview/` and its `InlineNoticeMock`.

**Interfaces:**

- Consumes: the shipped `AskUserCard` states.

This task ships no code — it verifies the feature in a real browser per the frontend UI-validation rule. The `_preview` route already renders `AskUserCard` in `running` (with and without submit support). The submit-error state needs a transient trigger, so add a temporary mock case to the preview (revert before finishing).

- [ ] **Step 1: Add a temporary submit-error preview case**

In `apps/frontend/src/pages/_preview/PreviewPageView.tsx`, the existing "AskUserCard — running (no submit support)" section already exercises `UnsupportedNotice` (it passes `onSubmit={null}`). For the error state, add one section that wires a rejecting handler:

```tsx
<Section title='AskUserCard — submit fails (click Submit)'>
  <AskUserCard
    status='running'
    callId='preview-err'
    arguments={ASK_ARGS}
    onSubmit={async () => {
      throw new Error('preview: simulated network failure');
    }}
  />
</Section>
```

- [ ] **Step 2: Start the dev server (if not already running)**

Run from repo root: `bun dev`
Open: `http://localhost:5173/preview`

- [ ] **Step 3: Verify in the browser, both themes**

For light AND dark (toggle via the sidebar theme button):

- "AskUserCard — running (no submit support)": shows the muted `UnsupportedNotice` ("This session can't accept answers.") above the footer; questionnaire still visible but disabled.
- "AskUserCard — submit fails": pick any answer, press **Submit** → the danger `SubmitErrorNotice` ("Couldn't reach the server. Try again.") fades in above the footer; answers remain selected; pressing Submit again clears the notice and re-triggers (then fails again). Confirm `ask_user submit failed` appears in the browser console with the raw error, and the raw message is NOT shown in the card.

- [ ] **Step 4: Verify reduced-motion**

In the browser devtools, emulate `prefers-reduced-motion: reduce`, repeat the submit-fail trigger, and confirm the notice appears with no fade/translate.

- [ ] **Step 5: Revert the temporary preview case**

Remove the "AskUserCard — submit fails" `<Section>` added in Step 1 so `_preview` returns to its prior state. (The `_preview` route remains uncommitted, as before.)

Run: `git status --short`
Expected: only the Task 1–4 commits are in history; `apps/frontend/src/pages/_preview/` and the router edits remain unstaged/untracked exactly as before this plan.

---

## Self-Review

**Spec coverage:**

- Unsupported notice (spec §3.3) → Task 2. ✓
- Submit-error notice with tint + fade-in + reduced-motion (spec §3.4) → Task 3. ✓
- `submitError` state, clear-on-retry, `console.error` (spec §3.5) → Task 1. ✓
- View wiring, mutually-exclusive slot, remove old `disabledNotice` + TODO (spec §3.2, §3.6, §5) → Task 4. ✓
- English copy (spec §4) → Global Constraints + Tasks 2/3 copy strings. ✓
- Two components not one (spec §3.1) → Tasks 2 & 3 separate. ✓
- Both-theme browser verification + console-only error (spec §6) → Task 5. ✓
- Out-of-scope items (CompletedCard/CancelledCard, `/preview`) → untouched. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"; every code step shows full content. The only `TODO(#307)` mentioned is the one being deleted in Task 4. ✓

**Type consistency:** `submitError: boolean` defined on `SubmitActions` in Task 1 and consumed as `submitActions.submitError` in Task 4. Component export names (`UnsupportedNotice`, `SubmitErrorNotice`) and their `index.js` barrels match between Tasks 2/3 (produce) and Task 4 (consume). Copy strings identical across Global Constraints, component source, and tests. ✓
