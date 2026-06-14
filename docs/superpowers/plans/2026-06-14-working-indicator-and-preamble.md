# Working Indicator + Pre-Action Preamble Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bland empty-bubble placeholder with an animated green-dot + shimmer-word "working" indicator, and instruct all agents to state their intent in one sentence before acting.

**Architecture:** Two independent changes. (1) Frontend: a new pure-CSS `WorkingIndicator` component swapped into the empty-assistant branch of `MessageBubbleView`; it derives purely from existing state (empty assistant bubble == waiting), no backend/SSE change. (2) Backend: a shared `preambleInstructions` constant added via the existing `system-prompts` mechanism (mirrors `mathRenderingInstructions`) and referenced by all four agents.

**Tech Stack:** React 19 + Vite + CSS Modules + HeroUI v3 theme tokens (frontend); Bun + TypeScript + Vitest (backend). Package manager: Bun (`bun run ...`).

---

## File Structure

Backend:

- `apps/backend/src/agent/system-prompts/preamble.ts` — new shared constant `preambleInstructions`.
- `apps/backend/src/agent/system-prompts/preamble.test.ts` — new unit test for the constant's content.
- `apps/backend/src/agent/system-prompts/index.ts` — re-export the constant.
- `apps/backend/src/agent/agents/main-agent/system-prompt.ts` — include constant.
- `apps/backend/src/agent/agents/coding-agent/system-prompt.ts` — include constant.
- `apps/backend/src/agent/agents/explore-sub-agent/system-prompt.ts` — include constant.
- `apps/backend/src/agent/agents/general-sub-agent/general-sub-agent.ts` — include constant.
- `apps/backend/src/agent/agents/main-agent/system-prompt.test.ts` — assert preamble present.

Frontend (new component folder, MVVM + CSS Modules):

- `.../MessageList/components/WorkingIndicator/index.ts`
- `.../MessageList/components/WorkingIndicator/WorkingIndicator.tsx` — picks a random word on mount.
- `.../MessageList/components/WorkingIndicator/WorkingIndicatorView.tsx` — stateless dot + word.
- `.../MessageList/components/WorkingIndicator/words.ts` — the gerund list + picker.
- `.../MessageList/components/WorkingIndicator/styles.module.css`
- `.../MessageList/components/WorkingIndicator/WorkingIndicatorView.test.tsx`
- `.../MessageBubble/MessageBubbleView.tsx` — swap empty assistant branch.

Path prefix `.../MessageList` =
`apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList`.

---

## Part A — Backend preamble

### Task 1: Add shared `preambleInstructions` constant

**Files:**

- Create: `apps/backend/src/agent/system-prompts/preamble.ts`
- Create: `apps/backend/src/agent/system-prompts/preamble.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/agent/system-prompts/preamble.test.ts`:

```ts
import {describe, expect, it} from 'vitest';

import {preambleInstructions} from './preamble.js';

describe('preambleInstructions', () => {
  it('instructs stating intent before taking any action', () => {
    expect(preambleInstructions).toContain('Before taking any action');
  });

  it('clarifies action is not limited to tool calls', () => {
    expect(preambleInstructions).toContain('not limited to tool calls');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun run test preamble`
Expected: FAIL — cannot resolve `./preamble.js`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/backend/src/agent/system-prompts/preamble.ts`:

```ts
export const preambleInstructions = [
  "Before taking any action, state in one sentence what you're about to do and why.",
  '"Action" here is not limited to tool calls — before starting a stretch of multi-step work, moving into a new phase, or tackling a sub-problem, briefly say what you intend to do.',
  'Keep it short; one sentence is usually enough.',
  'The goal is to keep the user aware of what you are doing and about to do, rather than working silently for a long time.',
].join('\n');
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun run test preamble`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/agent/system-prompts/preamble.ts apps/backend/src/agent/system-prompts/preamble.test.ts
git commit -m "feat(backend): add shared pre-action preamble instructions"
```

### Task 2: Re-export from system-prompts index

**Files:**

- Modify: `apps/backend/src/agent/system-prompts/index.ts`

- [ ] **Step 1: Add the re-export**

Current content:

```ts
export {mathRenderingInstructions} from './math-rendering.js';
```

Replace with:

```ts
export {mathRenderingInstructions} from './math-rendering.js';
export {preambleInstructions} from './preamble.js';
```

- [ ] **Step 2: Verify it compiles**

Run: `cd apps/backend && bun run typecheck`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/agent/system-prompts/index.ts
git commit -m "feat(backend): re-export preamble instructions from system-prompts"
```

### Task 3: Wire preamble into main-agent (with test)

**Files:**

- Modify: `apps/backend/src/agent/agents/main-agent/system-prompt.ts`
- Modify: `apps/backend/src/agent/agents/main-agent/system-prompt.test.ts`

- [ ] **Step 1: Write the failing test**

Replace `apps/backend/src/agent/agents/main-agent/system-prompt.test.ts` with:

```ts
import {describe, expect, it} from 'vitest';

import {
  mathRenderingInstructions,
  preambleInstructions,
} from '@/agent/system-prompts/index.js';

import {mainAgentSystemPrompt} from './system-prompt.js';

describe('mainAgentSystemPrompt', () => {
  it('includes the shared math rendering instructions', () => {
    expect(mainAgentSystemPrompt).toContain(mathRenderingInstructions);
  });

  it('includes the shared preamble instructions', () => {
    expect(mainAgentSystemPrompt).toContain(preambleInstructions);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun run test main-agent`
Expected: FAIL — `mainAgentSystemPrompt` does not contain `preambleInstructions`.

- [ ] **Step 3: Write minimal implementation**

Replace `apps/backend/src/agent/agents/main-agent/system-prompt.ts` with:

```ts
import {
  mathRenderingInstructions,
  preambleInstructions,
} from '@/agent/system-prompts/index.js';

export const mainAgentSystemPrompt = [
  'You are a helpful assistant.',
  '',
  preambleInstructions,
  '',
  mathRenderingInstructions,
].join('\n');
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun run test main-agent`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/agent/agents/main-agent/system-prompt.ts apps/backend/src/agent/agents/main-agent/system-prompt.test.ts
git commit -m "feat(backend): add preamble to main agent prompt"
```

### Task 4: Wire preamble into coding-agent

**Files:**

- Modify: `apps/backend/src/agent/agents/coding-agent/system-prompt.ts`

- [ ] **Step 1: Update imports**

Current import line:

```ts
import {mathRenderingInstructions} from '@/agent/system-prompts/index.js';
```

Replace with:

```ts
import {
  mathRenderingInstructions,
  preambleInstructions,
} from '@/agent/system-prompts/index.js';
```

- [ ] **Step 2: Insert the constant into the prompt array**

The array currently ends with:

```ts
  '- Note remaining risks, skipped checks, or user-visible follow-up only when they matter.',
  '',
  mathRenderingInstructions,
].join('\n');
```

Replace that tail with:

```ts
  '- Note remaining risks, skipped checks, or user-visible follow-up only when they matter.',
  '',
  preambleInstructions,
  '',
  mathRenderingInstructions,
].join('\n');
```

- [ ] **Step 3: Verify it compiles**

Run: `cd apps/backend && bun run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/agent/agents/coding-agent/system-prompt.ts
git commit -m "feat(backend): add preamble to coding agent prompt"
```

### Task 5: Wire preamble into explore-sub-agent

**Files:**

- Modify: `apps/backend/src/agent/agents/explore-sub-agent/system-prompt.ts`

- [ ] **Step 1: Update imports**

Current import line:

```ts
import {mathRenderingInstructions} from '@/agent/system-prompts/index.js';
```

Replace with:

```ts
import {
  mathRenderingInstructions,
  preambleInstructions,
} from '@/agent/system-prompts/index.js';
```

- [ ] **Step 2: Insert the constant into the prompt array**

The array currently ends with:

```ts
  '5. Suggested next steps',
  '',
  mathRenderingInstructions,
].join('\n');
```

Replace that tail with:

```ts
  '5. Suggested next steps',
  '',
  preambleInstructions,
  '',
  mathRenderingInstructions,
].join('\n');
```

- [ ] **Step 3: Verify it compiles**

Run: `cd apps/backend && bun run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/agent/agents/explore-sub-agent/system-prompt.ts
git commit -m "feat(backend): add preamble to explore subagent prompt"
```

### Task 6: Wire preamble into general-sub-agent

**Files:**

- Modify: `apps/backend/src/agent/agents/general-sub-agent/general-sub-agent.ts`

- [ ] **Step 1: Update imports**

Current import line:

```ts
import {mathRenderingInstructions} from '@/agent/system-prompts/index.js';
```

Replace with:

```ts
import {
  mathRenderingInstructions,
  preambleInstructions,
} from '@/agent/system-prompts/index.js';
```

- [ ] **Step 2: Insert the constant into the `baseSystemPrompt` array**

The `baseSystemPrompt` currently reads:

```ts
      baseSystemPrompt: [
        'You are a helpful assistant working on a delegated subtask. ' +
          'After completing your task, provide a concise summary of what you did and the results.',
        '',
        mathRenderingInstructions,
      ].join('\n'),
```

Replace with:

```ts
      baseSystemPrompt: [
        'You are a helpful assistant working on a delegated subtask. ' +
          'After completing your task, provide a concise summary of what you did and the results.',
        '',
        preambleInstructions,
        '',
        mathRenderingInstructions,
      ].join('\n'),
```

- [ ] **Step 3: Verify it compiles**

Run: `cd apps/backend && bun run typecheck`
Expected: PASS.

- [ ] **Step 4: Run the full backend test suite**

Run: `cd apps/backend && bun run test`
Expected: PASS (all tests, including the new preamble + main-agent tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/agent/agents/general-sub-agent/general-sub-agent.ts
git commit -m "feat(backend): add preamble to general subagent prompt"
```

---

## Part B — Frontend working indicator

### Task 7: Word list + random picker

**Files:**

- Create: `.../MessageList/components/WorkingIndicator/words.ts`

(`.../MessageList` = `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList`)

- [ ] **Step 1: Create the word list module**

Create `.../WorkingIndicator/words.ts`:

```ts
/** Generic gerunds shown while the agent is working. Decorative only. */
export const WORKING_WORDS = [
  'Thinking…',
  'Pondering…',
  'Brewing…',
  'Cooking…',
  'Crafting…',
  'Conjuring…',
  'Noodling…',
  'Tinkering…',
] as const;

/** Returns a random word from WORKING_WORDS. */
export function pickWorkingWord(): string {
  const index = Math.floor(Math.random() * WORKING_WORDS.length);
  return WORKING_WORDS[index];
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd apps/frontend && bunx tsc -b --noEmit` (or rely on Task 11's render test).
Expected: no type errors for this file.

- [ ] **Step 3: Commit**

```bash
git add "apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/WorkingIndicator/words.ts"
git commit -m "feat(frontend): add working-indicator word list"
```

### Task 8: Stateless view (dot + shimmer word) + styles

**Files:**

- Create: `.../WorkingIndicator/WorkingIndicatorView.tsx`
- Create: `.../WorkingIndicator/styles.module.css`

- [ ] **Step 1: Create the styles**

Create `.../WorkingIndicator/styles.module.css`:

```css
.indicator {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.dot {
  position: relative;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--success);
  flex-shrink: 0;
}

.dot::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: var(--success);
  animation: pulse 1.5s ease-out infinite;
}

@keyframes pulse {
  0% {
    transform: scale(1);
    opacity: 0.7;
  }
  100% {
    transform: scale(2.8);
    opacity: 0;
  }
}

.word {
  font-size: 0.9375rem;
  font-weight: 600;
  background: linear-gradient(
    90deg,
    var(--muted) 35%,
    var(--foreground) 50%,
    var(--muted) 65%
  );
  background-size: 200% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: sweep 2.2s linear infinite;
}

@keyframes sweep {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .dot::after,
  .word {
    animation: none;
  }
  .word {
    -webkit-text-fill-color: var(--muted);
    color: var(--muted);
  }
}
```

- [ ] **Step 2: Create the view component**

Create `.../WorkingIndicator/WorkingIndicatorView.tsx`:

```tsx
import styles from './styles.module.css';

interface WorkingIndicatorViewProps {
  word: string;
}

export function WorkingIndicatorView({word}: WorkingIndicatorViewProps) {
  return (
    <span className={styles.indicator}>
      <span className={styles.dot} aria-hidden='true' />
      <span className={styles.word}>{word}</span>
    </span>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add "apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/WorkingIndicator/WorkingIndicatorView.tsx" "apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/WorkingIndicator/styles.module.css"
git commit -m "feat(frontend): add working-indicator view and styles"
```

### Task 9: Container (picks word on mount) + index

**Files:**

- Create: `.../WorkingIndicator/WorkingIndicator.tsx`
- Create: `.../WorkingIndicator/index.ts`

- [ ] **Step 1: Create the container**

Create `.../WorkingIndicator/WorkingIndicator.tsx`:

```tsx
import {useState} from 'react';

import {WorkingIndicatorView} from './WorkingIndicatorView.js';
import {pickWorkingWord} from './words.js';

export function WorkingIndicator() {
  // Pick once on mount and keep it stable for this placeholder's lifetime.
  const [word] = useState(pickWorkingWord);

  return <WorkingIndicatorView word={word} />;
}
```

- [ ] **Step 2: Create the index (non-page export convention)**

Create `.../WorkingIndicator/index.ts`:

```ts
export {WorkingIndicator} from './WorkingIndicator.js';
```

- [ ] **Step 3: Commit**

```bash
git add "apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/WorkingIndicator/WorkingIndicator.tsx" "apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/WorkingIndicator/index.ts"
git commit -m "feat(frontend): add working-indicator container and export"
```

### Task 10: Swap it into MessageBubbleView

**Files:**

- Modify: `.../MessageBubble/MessageBubbleView.tsx`

- [ ] **Step 1: Update the component**

Replace the entire contents of
`.../MessageBubble/MessageBubbleView.tsx` with:

```tsx
import {Skeleton} from '@heroui/react';
import clsx from 'clsx';

import {MarkdownRenderer} from '@/components/MarkdownRenderer/index.js';

import type {ChatMessage} from '../../../../types.js';
import {WorkingIndicator} from '../WorkingIndicator/index.js';
import styles from './styles.module.css';

interface MessageBubbleViewProps {
  role: ChatMessage['role'];
  content: string;
}

export function MessageBubbleView({role, content}: MessageBubbleViewProps) {
  return (
    <div
      className={clsx(styles.bubble, {
        [styles.user]: role === 'user',
        [styles.assistant]: role === 'assistant',
      })}
    >
      <div className={styles.content}>{renderContent(role, content)}</div>
    </div>
  );
}

function renderContent(role: ChatMessage['role'], content: string) {
  if (content) {
    return <MarkdownRenderer content={content} />;
  }
  if (role === 'assistant') {
    return <WorkingIndicator />;
  }
  return <Skeleton className={styles.skeleton} />;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd apps/frontend && bunx tsc -b --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/MessageBubble/MessageBubbleView.tsx"
git commit -m "feat(frontend): show working indicator for empty assistant bubble"
```

### Task 11: Render tests for the indicator and bubble swap

**Files:**

- Create: `.../WorkingIndicator/WorkingIndicatorView.test.tsx`

- [ ] **Step 1: Write the tests**

Create `.../WorkingIndicator/WorkingIndicatorView.test.tsx`:

```tsx
import {render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';

import {WorkingIndicatorView} from './WorkingIndicatorView.js';
import {WORKING_WORDS} from './words.js';

describe('WorkingIndicatorView', () => {
  it('renders the given word', () => {
    render(<WorkingIndicatorView word='Brewing…' />);
    expect(screen.getByText('Brewing…')).toBeInTheDocument();
  });

  it('uses a word that exists in the shared list', () => {
    const word = WORKING_WORDS[0];
    render(<WorkingIndicatorView word={word} />);
    expect(screen.getByText(word)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `cd apps/frontend && bun run test WorkingIndicatorView`
Expected: PASS (both tests).

- [ ] **Step 3: Add a bubble-swap test**

Append to the same file a block verifying `MessageBubbleView` chooses the
indicator only for empty assistant bubbles. Add these imports at the top:

```tsx
import {MessageBubbleView} from '../MessageBubble/MessageBubbleView.js';
```

And add this `describe` block:

```tsx
describe('MessageBubbleView empty state', () => {
  it('shows a working word for an empty assistant bubble', () => {
    render(<MessageBubbleView role='assistant' content='' />);
    const matched = WORKING_WORDS.some((w) => screen.queryByText(w) !== null);
    expect(matched).toBe(true);
  });

  it('does not show a working word for an empty user bubble', () => {
    render(<MessageBubbleView role='user' content='' />);
    const matched = WORKING_WORDS.some((w) => screen.queryByText(w) !== null);
    expect(matched).toBe(false);
  });
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/frontend && bun run test WorkingIndicatorView`
Expected: PASS (all four tests).

- [ ] **Step 5: Commit**

```bash
git add "apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/WorkingIndicator/WorkingIndicatorView.test.tsx"
git commit -m "test(frontend): cover working indicator and empty-bubble swap"
```

---

## Part C — Verification

### Task 12: Lint, typecheck, full test suites

- [ ] **Step 1: Backend checks**

Run: `cd apps/backend && bun run lint && bun run typecheck && bun run test`
Expected: all PASS.

- [ ] **Step 2: Frontend checks**

Run: `cd apps/frontend && bun run lint && bun run test`
Expected: all PASS.

- [ ] **Step 3: Manual UI check**

Run: `cd apps/frontend && bun run dev` (and backend `bun run dev` if needed).
In the browser:

1. Send a message. While waiting for the first token, confirm the green
   pulsing dot + shimmering gerund appears in place of the old skeleton.
2. Confirm it disappears the moment streamed text begins.
3. Confirm the assistant now opens with a one-sentence statement of what
   it is about to do before calling tools / starting multi-step work.
4. Toggle dark mode; confirm colors still read well (tokens adapt).

- [ ] **Step 4: Final commit (if any lint autofix changes)**

```bash
git add -A
git commit -m "chore: lint and format working-indicator + preamble"
```

---

## Self-Review Notes

- **Spec coverage:** Indicator visual (green dot + shimmer word + random
  gerund) → Tasks 7–10. Only-assistant gating → Task 10 + test in Task 11.
  Auto-disappear on first token → inherent to empty-content branch (Task 10).
  Shared preamble constant via existing mechanism → Tasks 1–2. Applied to
  all four agents → Tasks 3–6. Tests → Tasks 1, 3, 11. Manual check →
  Task 12.
- **Type consistency:** `pickWorkingWord(): string`, `WORKING_WORDS`
  (readonly tuple), `WorkingIndicatorView({word})`, `WorkingIndicator()`
  used consistently across Tasks 7–11. `preambleInstructions` named
  identically in Tasks 1–6.
- **No placeholders:** every code step shows full content.
- **Reduced-motion:** added `prefers-reduced-motion` fallback so the
  shimmer/pulse stop and text stays readable (accessibility, not in spec
  but a low-cost correctness addition).
