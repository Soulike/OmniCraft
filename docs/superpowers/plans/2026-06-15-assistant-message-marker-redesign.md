# Assistant Message Marker Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **⚠️ Superseded structure (read first):** This plan was executed as written —
> the marker first shipped inside a single `MessageBubble` / `MessageBubbleView`
> with a `role` branch. As a follow-up in the same PR, that component was **split**
> into two single-responsibility MVVM components, `AssistantMessage` and
> `UserMessage` (selected in `RenderItem`), and `MessageBubble` was deleted. So
> every `MessageBubble*` path and the `theme`-prop-on-the-shared-view detail below
> are **historical**: the steps describe how the work was done, not the final file
> layout. For the current structure see §6 of the spec
> (`docs/superpowers/specs/2026-06-15-assistant-message-marker-redesign-design.md`).

**Goal:** Replace the assistant turn's bare 13px glass dot + uppercase "ASSISTANT" label with a 32px circular glass sigil housing the real OmniCraft topology logo (theme-aware SVG) plus an "OmniCraft" wordmark.

**Architecture:** The marker lives in the assistant branch of `MessageBubbleView` (a stateless MVVM view). The view gains a `theme` prop; the `MessageBubble` container resolves the theme via the existing `useTheme()` hook and passes it down — mirroring how `SidebarView`/`Sidebar` already house the brand logo. New CSS for the circular sigil replaces the old dot/label styles. Full-width body, `WorkingIndicator` empty state, timestamp, and `fadeInUp` entry are all untouched.

**Tech Stack:** React 19, TypeScript, Vite (`?react` SVG imports), CSS Modules, Vitest + Testing Library. Package manager / runner: Bun (`bun run test`, never `bun test`).

**Spec:** `docs/superpowers/specs/2026-06-15-assistant-message-marker-redesign-design.md`

---

## File Structure

- **Modify** `apps/frontend/.../MessageBubble/MessageBubbleView.tsx` — assistant branch renders sigil + wordmark; add `theme` prop; import + select brand SVG.
- **Modify** `apps/frontend/.../MessageBubble/MessageBubble.tsx` — resolve `resolvedTheme` via `useTheme()`, pass `theme` to the view.
- **Modify** `apps/frontend/.../MessageBubble/styles.module.css` — add `.sigil` circular glass + `.sigilIcon`; rework `.assistantLabel` into a marker row; remove `.assistantDot`.
- **Modify** `apps/frontend/.../WorkingIndicator/WorkingIndicatorView.test.tsx` — the two tests that render `MessageBubbleView` directly must pass the new required `theme` prop.

Full path prefix for the MessageBubble files:
`apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/MessageBubble/`

The test file lives at:
`apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/WorkingIndicator/WorkingIndicatorView.test.tsx`

---

## Reference facts (verified against the codebase)

- Brand SVGs exist: `@/assets/icons/omnicraft-dark.svg` and `@/assets/icons/omnicraft-light.svg`, imported with the `?react` suffix as React components (see `SidebarView.tsx:4-5`).
- `ResolvedTheme = 'light' | 'dark'`, exported from `@/contexts/theme/index.js`.
- `useTheme()` lives at `@/hooks/useTheme.js` and returns `{resolvedTheme}` (see `Sidebar.tsx:5,15`).
- The `BRAND_ICONS` pattern: `Record<ResolvedTheme, FC<SVGProps<SVGSVGElement>>>` (see `SidebarView.tsx:14-17`).
- The pedestal in the sidebar uses `--aurora-glass-fill` + `--aurora-glass-border` + `--aurora-glass-highlight` (see `Sidebar/styles.module.css:31-41`); the sigil reuses these, only the shape changes to a circle.
- Current `MessageBubbleView` renders the literal text `Assistant` inside `.assistantLabel` (line 33); the `WorkingIndicator` test renders `MessageBubbleView role='assistant'` directly (no theme prop today).

---

## Task 1: Add `theme` prop to the view and render the sigil + wordmark

**Files:**

- Modify: `.../MessageBubble/MessageBubbleView.tsx`
- Modify: `.../MessageBubble/MessageBubble.tsx`
- Modify: `.../MessageBubble/styles.module.css`
- Modify: `.../WorkingIndicator/WorkingIndicatorView.test.tsx`

- [ ] **Step 1: Update the view to take a `theme` prop and render the new marker**

Replace the entire contents of `MessageBubbleView.tsx` with:

```tsx
import {Skeleton} from '@heroui/react';
import type {FC, SVGProps} from 'react';

import OmnicraftDarkIcon from '@/assets/icons/omnicraft-dark.svg?react';
import OmnicraftLightIcon from '@/assets/icons/omnicraft-light.svg?react';
import {MarkdownRenderer} from '@/components/MarkdownRenderer/index.js';
import type {ResolvedTheme} from '@/contexts/theme/index.js';

import type {ChatMessage} from '../../../../types.js';
import {WorkingIndicator} from '../WorkingIndicator/index.js';
import styles from './styles.module.css';

const BRAND_ICONS: Record<ResolvedTheme, FC<SVGProps<SVGSVGElement>>> = {
  light: OmnicraftLightIcon,
  dark: OmnicraftDarkIcon,
};

interface MessageBubbleViewProps {
  role: ChatMessage['role'];
  content: string;
  theme: ResolvedTheme;
}

export function MessageBubbleView({
  role,
  content,
  theme,
}: MessageBubbleViewProps) {
  if (role === 'user') {
    return (
      <div className={styles.userBubble}>
        <div className={styles.content}>
          {content ? (
            <MarkdownRenderer content={content} />
          ) : (
            <Skeleton className={styles.skeleton} />
          )}
        </div>
      </div>
    );
  }

  const BrandIcon = BRAND_ICONS[theme];

  return (
    <div className={styles.assistant}>
      <div className={styles.assistantLabel}>
        <span className={styles.sigil} aria-hidden='true'>
          <BrandIcon className={styles.sigilIcon} />
        </span>
        <span className={styles.assistantName}>OmniCraft</span>
      </div>
      <div className={styles.content}>
        {content ? (
          <MarkdownRenderer content={content} />
        ) : (
          <WorkingIndicator />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Pass the resolved theme from the container**

In `MessageBubble.tsx`, add the `useTheme` import and pass `theme` to the view. Replace the file contents with:

```tsx
import {useDeferredValue} from 'react';

import {useStreamingText} from '@/hooks/useStreamingText.js';
import {useTheme} from '@/hooks/useTheme.js';

import type {ChatMessage} from '../../../../types.js';
import {MessageBubbleView} from './MessageBubbleView.js';

interface MessageBubbleProps {
  role: ChatMessage['role'];
  id: string | null;
  content: string;
}

export function MessageBubble({
  role,
  id: _id, // Reserved for future message editing
  content,
}: MessageBubbleProps) {
  const {resolvedTheme} = useTheme();
  const {displayedContent} = useStreamingText(content);
  const displayContent = role === 'assistant' ? displayedContent : content;
  const deferredContent = useDeferredValue(displayContent);

  return (
    <MessageBubbleView
      role={role}
      content={deferredContent}
      theme={resolvedTheme}
    />
  );
}
```

- [ ] **Step 3: Replace the dot styles with the circular sigil**

In `styles.module.css`, make these changes:

Replace the `.assistantLabel` block (currently lines 7-17) with:

```css
.assistantLabel {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.assistantName {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 0.9375rem;
  letter-spacing: -0.005em;
  color: var(--foreground);
}
```

Replace the `.assistantDot` block (currently lines 19-26) with:

```css
.sigil {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--aurora-glass-fill);
  border: 1px solid var(--aurora-glass-border);
  box-shadow: var(--aurora-glass-highlight);
}

.sigilIcon {
  width: 20px;
  height: 20px;
}
```

Leave `.assistant`, `.userBubble`, `.content`, and `.skeleton` unchanged.

- [ ] **Step 4: Fix the existing tests that render the view directly**

In `WorkingIndicatorView.test.tsx`, the two `MessageBubbleView` renders must pass `theme`. Change:

```tsx
render(<MessageBubbleView role='assistant' content='' />);
```

to

```tsx
render(<MessageBubbleView role='assistant' content='' theme='dark' />);
```

and change:

```tsx
render(<MessageBubbleView role='user' content='' />);
```

to

```tsx
render(<MessageBubbleView role='user' content='' theme='dark' />);
```

- [ ] **Step 5: Run the affected tests**

Run from repo root: `bun run test --run WorkingIndicatorView`
Expected: PASS (the empty-state assertions still hold — empty assistant bubble shows a working word; empty user bubble does not).

- [ ] **Step 6: Typecheck + full frontend tests**

Run from repo root: `bun run test --run` (and the project's typecheck if separate — check `apps/frontend/package.json` scripts).
Expected: PASS, no TypeScript errors. The new required `theme` prop is satisfied everywhere `MessageBubbleView` is constructed (the container in Step 2 and the two tests in Step 4 are the only call sites).

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/MessageBubble/MessageBubbleView.tsx \
        apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/MessageBubble/MessageBubble.tsx \
        apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/MessageBubble/styles.module.css \
        apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/WorkingIndicator/WorkingIndicatorView.test.tsx
git commit -m "feat(chat): circular glass sigil for assistant marker (#285)"
```

---

## Task 2: Verify in the browser (both themes)

**Files:** none (manual verification per spec §7).

- [ ] **Step 1: Start the dev server**

Run from repo root: `bun dev`
Expected: Vite dev server boots; note the local URL.

- [ ] **Step 2: Open a chat session and inspect an assistant turn**

In the browser, trigger or open a session with at least one assistant reply.
Confirm:

- The marker is a 32px circular glass disc with the OmniCraft logo inside, followed by the "OmniCraft" wordmark in the display font.
- The body text is still full-width below the marker; the timestamp still appears.
- Empty/streaming assistant bubble still shows the `WorkingIndicator`.

- [ ] **Step 3: Toggle the theme and re-check**

Use the theme toggle. Confirm:

- Dark theme uses `omnicraft-dark.svg`; light theme uses `omnicraft-light.svg`.
- The glass disc reads correctly on both substrates (no muddy glow on light).
- The marker is completely static — no pulse, no loop.

- [ ] **Step 4: Judge the 32px logo clarity**

Per the spec open item: assess whether the logo is legible at 32px in both themes. If it reads cleanly, the design is done. If it looks muddy, note it and raise a sizing tweak (e.g. 34–36px disc or slightly larger inner icon) as a follow-up — do not change scope silently.

---

## Self-Review

**Spec coverage:**

- §3.1 circular 32px glass sigil → Task 1 Step 3 (`.sigil`). ✓
- §3.2 real theme-aware logo, geometry untouched → Task 1 Steps 1-2 (`BRAND_ICONS`, `?react` import, `theme` prop wiring). ✓
- §3.3 OmniCraft wordmark in display font → Task 1 Steps 1, 3 (`.assistantName`, `var(--font-display)`). ✓
- §4 unchanged: full-width body, MarkdownRenderer, WorkingIndicator, timestamp, fadeInUp → none touched; verified in Task 1 (view keeps body/empty-state branches) and Task 2 Step 2. ✓
- §5 both themes first-class, sigil static → Task 1 (per-theme SVG) + Task 2 Step 3. ✓
- §6 impacted files → exactly the four files in Task 1. ✓
- §7 acceptance: bun dev, both themes, `bun run test` → Task 1 Step 6 + Task 2. ✓
- §8 open item (32px sizing decision) → Task 2 Step 4. ✓

**Placeholder scan:** No TBD/TODO; all code blocks complete; exact commands given.

**Type consistency:** `theme: ResolvedTheme` defined in the view (Task 1 Step 1) and supplied by container `resolvedTheme` (Step 2) and tests (Step 4). `BRAND_ICONS` typing matches `SidebarView`. Class names `.sigil` / `.sigilIcon` / `.assistantName` are introduced in Step 3 and referenced in Step 1 — consistent.
