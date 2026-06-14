# Chat Aurora Glass — Phase 2 (Message Stream + Tool Cards) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the conversation surface — assistant replies become bare full-width text with a subtle label, user turns become glass accent bubbles, and the tool-execution / thinking cards become quiet collapsed pills that expand into B-tier glass cards (glass shell, opaque code/terminal/diff blocks).

**Architecture:** Mostly CSS-module work plus a small structural change in two view files (`MessageBubbleView` to branch assistant-vs-user rendering; `RenderItem` to make assistant text full-width). The 11 tool result renderers keep their structure and only get token/background alignment so their text-bearing blocks stay opaque under the new glass card shell. Verification is browser-based in both themes (the spec's method); existing Vitest tests stay green and the two affected view tests are updated if their assertions reference changed markup.

**Tech Stack:** React 19 + Vite, CSS Modules, HeroUI v3 (`Disclosure`, `ScrollShadow`, `Spinner`), `--aurora-*` + HeroUI theme tokens, lucide-react, clsx. Package manager: Bun. Tests: Vitest (**run via `bun run test`**, never `bun test`). Lint: ESLint (run from `apps/frontend`).

**Source spec:** `docs/superpowers/specs/2026-06-14-chat-aurora-glass-redesign-design.md` — decisions D2 (messages) + D5 (tool cards); component sections §3 (message stream), §3a (tool cards). Phase 1 (foundation) is already merged on this branch; Phase 3 (composer + welcome) is a separate plan.

**Scope note:** All these components live in the shared `chat-session` module, so the changes land on both Chat and Coding.

---

## File Structure

Files touched in this phase:

- `.../MessageList/components/MessageBubble/MessageBubbleView.tsx` — **Modify.** Branch rendering: assistant = bare text + label/dot row; user = glass capsule. (Container `MessageBubble.tsx` unchanged — it only feeds content.)
- `.../MessageBubble/styles.module.css` — **Modify.** Replace twin-bubble styles with bare-assistant + glass-user-capsule styles + the label/dot.
- `.../MessageList/components/RenderItem/RenderItem.tsx` — **Modify.** Make the assistant-text and tool-execution wrappers full-width (assistant flows wide; user stays right-aligned bubble).
- `.../RenderItem/styles.module.css` — **Modify.** Ensure `.assistantMessage` can host full-width children (already has `fullWidthMessage`; reuse it).
- `.../MessageList/styles.module.css` — **Modify.** Tune vertical rhythm/gap for the label+text pattern.
- `.../ToolExecutionCard/styles.module.css` — **Modify.** Quiet collapsed pill + B-tier glass expanded card; keep inner `.pre` blocks opaque.
- `.../ToolExecutionCard/components/ResultSection/styles.module.css` — **Modify.** Confirm/keep `.pre` opaque (`var(--background)`), align labels to tokens.
- The per-tool result stylesheets (`RunCommandResult`, `SearchFilesResult`, `FindFilesResult`, `WebSearchResult`, `WebFetchResult`, `ReadFileResult`, `EditFileResult`, `WriteFileResult`, `LoadSkillResult`, `HighlightedJson`) — **Modify (token alignment only).** Ensure every code/terminal/diff/list block keeps an opaque background (`var(--background)` or `var(--surface)`); align stray colors to documented tokens. Structure unchanged.
- `.../ThinkingBlock/styles.module.css` (+ `ThinkingBlockView.tsx` if needed) — **Modify.** Match the quiet-pill → glass-card pattern of tool cards.

No data-flow / hook changes. The `ask_user`, `subagent`, and `context-compaction` blocks are out of scope for restyle in this phase (they are distinct interactive cards; leave them functional and visually acceptable — a follow-up can polish them).

---

## Pre-flight

- [ ] **Step 0: Confirm Phase 1 is in place and tests are green**

```bash
cd apps/frontend && bun run test
```

Expected: PASS (200 tests). If the dev server is needed for visual checks, start it from repo root with `bun dev` and open the printed URL (typically `http://localhost:5173`), navigate to **Chat**, and open a session that contains tool calls (e.g. a coding session) so you can see diffs/commands. The user may prefer to start it themselves — if so, ask before launching.

---

## Task 1: Bare assistant text + glass user bubble

Implements D2. Assistant replies render as open full-width text with a small `Assistant` label + glass dot; user replies render as a right-aligned glass accent capsule.

**Files:**

- Modify: `.../MessageBubble/MessageBubbleView.tsx`
- Modify: `.../MessageBubble/styles.module.css`
- Modify: `.../RenderItem/RenderItem.tsx:34-44` (assistant-text wrapper → full width)

- [ ] **Step 1: Rewrite `MessageBubbleView.tsx` to branch on role**

Replace the whole component body (keep imports; add nothing new except `clsx` already present):

```tsx
import {Skeleton} from '@heroui/react';

import {MarkdownRenderer} from '@/components/MarkdownRenderer/index.js';

import type {ChatMessage} from '../../../../types.js';
import {WorkingIndicator} from '../WorkingIndicator/index.js';
import styles from './styles.module.css';

interface MessageBubbleViewProps {
  role: ChatMessage['role'];
  content: string;
}

export function MessageBubbleView({role, content}: MessageBubbleViewProps) {
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

  return (
    <div className={styles.assistant}>
      <div className={styles.assistantLabel}>
        <span className={styles.assistantDot} aria-hidden='true' />
        Assistant
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

- [ ] **Step 2: Replace `MessageBubble/styles.module.css`**

Replace the entire file with the bare-assistant + glass-user-capsule styles:

```css
/* Assistant: bare, full-width text marked by a subtle label + glass dot. */
.assistant {
  width: 100%;
  color: var(--foreground);
}

.assistantLabel {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 6px;
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
}

.assistantDot {
  width: 13px;
  height: 13px;
  border-radius: 4px;
  background: var(--aurora-active-fill);
  border: 1px solid var(--aurora-glass-border);
  box-shadow: var(--aurora-glass-highlight);
}

/* User: right-aligned glass accent capsule. */
.userBubble {
  padding: 10px 14px;
  border-radius: 16px;
  border-bottom-right-radius: 4px;
  background: var(--aurora-active-fill);
  border: 1px solid var(--aurora-glass-border);
  box-shadow: var(--aurora-glass-highlight);
  color: var(--foreground);
  word-wrap: break-word;
}

.content {
  line-height: 1.5;
}

.skeleton {
  height: 1em;
  width: 8em;
  border-radius: 4px;
}
```

- [ ] **Step 3: Make the assistant-text wrapper full-width in `RenderItem.tsx`**

In the `case 'assistant-text':` block (around lines 34-44), add `styles.fullWidthMessage` to the wrapper so bare text spans the column:

```tsx
    case 'assistant-text':
      return (
        <div className={clsx(styles.assistantMessage, styles.fullWidthMessage)}>
          <MessageBubble role='assistant' id={item.id} content={item.content} />
          {item.createdAt !== null && item.content !== '' && (
            <time className={clsx(styles.timestamp, styles.timestampRight)}>
              {formatTimestamp(item.createdAt)}
            </time>
          )}
        </div>
      );
```

(`clsx` is already imported in `RenderItem.tsx`. The user-text case stays unchanged — `.userMessage` keeps `align-self: flex-end` so the capsule sits right.)

- [ ] **Step 4: Adjust the assistant timestamp alignment**

The assistant timestamp currently uses `timestampRight` (a holdover from right-aligned bubbles). Now that assistant text is left-flowing, remove the right alignment for assistant: change the assistant-text `<time>` className to just `styles.timestamp` (drop `styles.timestampRight`):

```tsx
<time className={styles.timestamp}>{formatTimestamp(item.createdAt)}</time>
```

- [ ] **Step 5: Run tests, lint**

```bash
cd apps/frontend && bun run test && bun run lint
```

Expected: tests PASS (200), lint 0 errors. If a `MessageBubbleView` or `RenderItem` test asserts on the old `.bubble`/`.user`/`.assistant` class or the twin-bubble markup, update that assertion to match the new structure (assistant has `.assistantLabel` text "Assistant"; user has `.userBubble`). Show the updated test in the commit.

- [ ] **Step 6: Browser check (both themes)**

Open a session with a back-and-forth. Assistant replies are full-width bare text under a small "Assistant" label + glass dot; user replies are right-aligned glass accent capsules. Check light + dark. Streaming/waiting still shows the `WorkingIndicator`.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/MessageBubble apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/RenderItem/RenderItem.tsx
git commit -m "feat(frontend): bare assistant text + glass user bubble in chat stream"
```

---

## Task 2: Tune message-list rhythm

Now that assistant text is unboxed, tighten the vertical rhythm so turns read cleanly.

**Files:**

- Modify: `.../MessageList/styles.module.css`

- [ ] **Step 1: Increase the inter-turn gap**

In `.../MessageList/styles.module.css`, change the `.list` gap from `12px` to `18px` so unboxed turns have breathing room:

```css
.list {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
```

(Leave `.container` padding and `.empty`/`.emptyText` as-is.)

- [ ] **Step 2: Browser check**

Confirm the spacing between an assistant turn and the next user/tool turn looks balanced (not cramped, not floaty). Adjust to `16px` or `20px` if needed.

- [ ] **Step 3: Tests, lint, commit**

```bash
cd apps/frontend && bun run test && bun run lint
git add apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/styles.module.css
git commit -m "feat(frontend): tune chat message-list rhythm for unboxed turns"
```

---

## Task 3: Tool cards — quiet pill + B-tier glass card

Implements D5/§3a. The collapsed pill stays nearly text; the expanded card shell becomes translucent glass while inner code/terminal/diff blocks stay opaque.

**Files:**

- Modify: `.../ToolExecutionCard/styles.module.css`
- Modify: `.../RenderItem/RenderItem.tsx:90-102` (tool-execution wrapper → full width)

- [ ] **Step 1: Make the tool-execution wrapper full-width**

In `RenderItem.tsx`, the non-`ask_user` tool-execution return (around lines 90-102), add `styles.fullWidthMessage`:

```tsx
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
```

- [ ] **Step 2: Restyle the card shell + collapsed pill**

In `.../ToolExecutionCard/styles.module.css`, replace the `.card` and `.trigger` rules (lines 1-36) so the collapsed pill is quiet (no border/background) and only the expanded shell gets glass:

```css
.card {
  border-radius: 10px;
  width: 100%;
  max-width: 100%;
}

/* Expanded: B-tier glass shell (translucent + blur), blends into the Mica.
   Inner code/terminal/diff blocks stay opaque (see ResultSection .pre). */
.card:has(.trigger[aria-expanded='true']) {
  background: var(--aurora-glass-fill);
  border: 1px solid var(--aurora-glass-border);
  box-shadow: var(--aurora-glass-highlight);
  backdrop-filter: blur(14px) saturate(1.6);
  -webkit-backdrop-filter: blur(14px) saturate(1.6);
}

.trigger {
  display: grid;
  grid-template-columns: 14px auto minmax(0, 1fr) 14px;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 28px;
  box-sizing: border-box;
  padding: 3px 8px;
  cursor: pointer;
  background: none;
  border: none;
  border-radius: 10px;
  color: inherit;
  font: inherit;
  text-align: left;
  transition: background 150ms ease;
}

.trigger:hover {
  background: var(--aurora-glass-fill);
}

.trigger:focus-visible {
  outline: 1px solid color-mix(in srgb, var(--accent) 55%, transparent);
  outline-offset: 2px;
}
```

- [ ] **Step 3: Keep the expanded body padding and ensure code blocks stay opaque**

Confirm `.body` (the expanded content padding) reads `padding: 4px 10px 8px;` — leave as-is. Confirm the inline `.pre` block in this file (lines ~143-154) keeps `background: var(--background);` (opaque) — this is the rule that guarantees readability over the glass shell. Leave it opaque; do NOT make it translucent.

- [ ] **Step 4: Add reduced-motion guard**

Append to the end of `.../ToolExecutionCard/styles.module.css`:

```css
@media (prefers-reduced-motion: reduce) {
  .trigger {
    transition: none;
  }
}
```

- [ ] **Step 5: Browser check (both themes)**

Open a session with tool calls.

- **Collapsed:** the row reads as quiet near-text (icon + tool name + muted target), with a faint glass wash only on hover. Status icons correct (running spinner / done check / warning / error).
- **Expanded:** the card shell is translucent glass blending into the Mica, but the parameters/output/diff/terminal blocks inside are opaque and crisply legible.
- Light + dark both correct.

- [ ] **Step 6: Tests, lint, commit**

```bash
cd apps/frontend && bun run test && bun run lint
git add apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/styles.module.css apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/RenderItem/RenderItem.tsx
git commit -m "feat(frontend): quiet tool pills with B-tier glass expanded cards"
```

---

## Task 4: Tool result renderers — keep text blocks opaque, align tokens

Each of the 11 renderers' code/terminal/diff/list blocks must stay opaque under the glass shell, and stray colors align to documented tokens. Structure unchanged.

**Files (token/background alignment only):**

- Modify: `.../ToolExecutionCard/components/ResultSection/styles.module.css`
- Modify: each `*Result/styles.module.css` that has a text-bearing block

- [ ] **Step 1: ResultSection `.pre` stays opaque**

In `.../ResultSection/styles.module.css`, confirm `.pre` uses `background: var(--background);` (it does). No change needed unless it was edited; leave opaque. This is the canonical opaque text block.

- [ ] **Step 2: Audit every result block background**

Run this to list the text-block backgrounds:

```bash
cd apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/components && grep -rn 'background: var(--background)\|background: var(--surface)\|\.pre\|\.output\|\.stderr\|\.term\|\.diff' */styles.module.css
```

Confirm each code/terminal/diff/file-list/web-result text block resolves to an **opaque** fill — `var(--background)` or `var(--surface)`. The known opaque blocks already in place: `RunCommandResult` `.output`/`.stderr` (`var(--background)`), `SearchFilesResult`/`WebSearchResult` rows (`var(--background)`), `ReadFileResult` `.pre` (`var(--background)`). Leave all of these opaque.

- [ ] **Step 3: Align accent/diff tint tokens (no structural change)**

Where a result uses raw or `--color-*` tokens for accents (e.g. match highlight, web-result title), switch to documented tokens: highlight/title → `var(--accent)`; success/url → `var(--success)`; diff add → `color-mix(in oklch, var(--success) 15%, transparent)`, diff remove → `color-mix(in oklch, var(--danger) 15%, transparent)`. Only touch lines that use non-documented tokens; if a file already uses documented tokens, leave it.

Verify none remain:

```bash
cd apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard && grep -rn 'var(--color-' . || echo "CLEAN"
```

Expected: `CLEAN`.

- [ ] **Step 4: Browser check (both themes)**

Expand a diff (edit_file), a command (run_command), a search (search_files), and a web result. Each inner block is opaque and legible over the glass card; diff add/remove tints, exit badges, match highlights, and web titles all read correctly in light + dark.

- [ ] **Step 5: Tests, lint, commit**

```bash
cd apps/frontend && bun run test && bun run lint
git add apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/components
git commit -m "feat(frontend): align tool-result token usage, keep text blocks opaque"
```

---

## Task 5: ThinkingBlock — match the quiet-pill / glass-card pattern

`ThinkingBlock` should read like the tool cards: a quiet collapsed trigger that expands into a glass card, instead of the current dashed-border box.

**Files:**

- Modify: `.../ThinkingBlock/styles.module.css`

- [ ] **Step 1: Replace the dashed-border card with the quiet→glass pattern**

In `.../ThinkingBlock/styles.module.css`, replace `.card`, `.streaming`, `.done`, and `.trigger` (lines 1-28):

```css
.card {
  border-radius: 10px;
  overflow: hidden;
  width: 100%;
  max-width: 100%;
}

.card:has(.trigger[aria-expanded='true']) {
  background: var(--aurora-glass-fill);
  border: 1px solid var(--aurora-glass-border);
  box-shadow: var(--aurora-glass-highlight);
  backdrop-filter: blur(14px) saturate(1.6);
  -webkit-backdrop-filter: blur(14px) saturate(1.6);
}

.streaming .label {
  color: var(--accent);
}

.trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 10px;
  cursor: pointer;
  background: none;
  border: none;
  border-radius: 10px;
  color: inherit;
  font: inherit;
  text-align: left;
  transition: background 150ms ease;
}

.trigger:hover {
  background: var(--aurora-glass-fill);
}
```

(The `.done` class no longer needs a border; the streaming-vs-done distinction now lives in the label color via `.streaming .label`. `ThinkingBlockView.tsx` keeps applying `styles.done`/`styles.streaming` — `.done` becomes an empty-but-harmless class. Leave the TSX unchanged.)

- [ ] **Step 2: Add reduced-motion guard**

Append:

```css
@media (prefers-reduced-motion: reduce) {
  .trigger {
    transition: none;
  }
}
```

- [ ] **Step 3: Browser check (both themes)**

Trigger a thinking block (a session with reasoning). Collapsed = quiet "Thinking…/Thought" trigger; expanded = glass card with the reasoning text legible. Streaming label is accent-tinted; done label is muted. Light + dark.

- [ ] **Step 4: Tests, lint, commit**

```bash
cd apps/frontend && bun run test && bun run lint
git add apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ThinkingBlock/styles.module.css
git commit -m "feat(frontend): align thinking block to quiet-pill glass-card pattern"
```

---

## Task 6: Full-phase verification (both pages, both themes)

- [ ] **Step 1: Chat — dark and light**

Open a Chat session with assistant text, user turns, multiple tool calls (diff/command/search/web), and a thinking block. Verify: bare assistant text + label/dot; glass user capsules; quiet tool pills → glass cards with opaque inner blocks; glass thinking card. No console errors. Both themes.

- [ ] **Step 2: Coding — dark and light**

Open a Coding session (same components via the shared module). Verify the same treatments render and nothing in the Coding layout regressed.

- [ ] **Step 3: Reduced motion**

If you can toggle the OS reduced-motion setting, confirm pill/card hover and message fade-in transitions snap rather than animate.

- [ ] **Step 4: Final tests, lint, build**

```bash
cd apps/frontend && bun run test && bun run lint && bun run build
```

Expected: tests PASS (200+), lint 0 errors, build succeeds.

- [ ] **Step 5:** Verification only — no commit unless a fix was needed (use `fix(frontend):`).

---

## Self-Review (completed by plan author)

**Spec coverage (Phase-2 portion):**

- D2 / §3 assistant bare text + label/dot → Task 1 (steps 1-2). ✓
- D2 user glass capsule → Task 1 (step 2 `.userBubble`). ✓
- §3 assistant full-width in stream → Task 1 step 3 + Task 3 step 1 (`fullWidthMessage` on assistant-text and tool wrappers). ✓
- §3 MessageList rhythm → Task 2. ✓
- D5 / §3a quiet collapsed pill → Task 3 step 2 (`.trigger` quiet, hover wash). ✓
- D5 / §3a B-tier glass card shell, opaque inner blocks → Task 3 steps 2-3 + Task 4 (opaque `.pre`/`.output`/rows). ✓
- §3a four body archetypes keep structure, token-aligned → Task 4. ✓
- §3a ThinkingBlock follows the same pattern → Task 5. ✓
- Motion event-driven / reduced-motion → Tasks 3/5 reduced-motion guards (message fade-in already exists from before, unchanged). ✓
- Shared with Coding → Task 6 step 2. ✓
- Both themes first-class → every browser-check step. ✓
- Tokens via `--aurora-*`, no raw values, no `--color-*` → Task 4 step 3 grep gate. ✓

**Out of Phase 2 (correctly deferred):** composer capsule, welcome state (Phase 3); `ask_user` / `subagent` / `context-compaction` card polish (functional, left for a follow-up).

**Placeholder scan:** No TBD/TODO; every code/CSS step shows the exact content. ✓

**Type/selector consistency:** `MessageBubbleView` new classes (`.assistant`, `.assistantLabel`, `.assistantDot`, `.userBubble`, `.content`, `.skeleton`) all defined in the Task 1 CSS. `fullWidthMessage` already exists in `RenderItem/styles.module.css`. `.trigger[aria-expanded='true']` matches HeroUI `Disclosure.Trigger`'s emitted attribute (same pattern already used by the existing `.card:has(.trigger[aria-expanded='true'])` rule, confirmed in the current ToolExecutionCard CSS). All referenced `--aurora-*` tokens exist in `aurora-glass.css`. ✓

**Testing note:** No new logic, so per the spec it is verified in-browser; the existing Vitest suite is the regression guard and the two view tests (`ToolExecutionCardView.test.tsx`, plus any `MessageBubble`/`RenderItem` test) are updated only if their assertions reference changed markup (Task 1 step 5).
