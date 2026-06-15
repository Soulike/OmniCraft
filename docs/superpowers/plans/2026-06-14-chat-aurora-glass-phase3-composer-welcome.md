# Chat Aurora Glass — Phase 3 (Composer + Welcome) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the chat composer into a raised glass "command console" capsule (textarea + thinking pill + gradient Send, one-shot focus glow), and replace the plain empty-session text with a minimal glass-mark welcome state. Restyle the Coding `TaskDispatchCard` to match.

**Architecture:** CSS-module work plus a small markup wrap in `ChatInputView` (group the field + toolbar inside a capsule) and in `ChatPageView` (welcome glyph + headline). No hook/data-flow changes. The thinking-level `Select` becomes a glowing accent pill via its existing stylesheet. Verification is browser-based in both themes; existing Vitest suite stays green.

**Tech Stack:** React 19 + Vite, CSS Modules, HeroUI v3 (`TextArea`, `Button`, `Select`, `ListBox`), `--aurora-*` + HeroUI theme tokens, lucide-react. Package manager: Bun. Tests: Vitest (**run via `bun run test`**, never `bun test`). Lint: ESLint (from `apps/frontend`).

**Source spec:** `docs/superpowers/specs/2026-06-14-chat-aurora-glass-redesign-design.md` — decisions D3 (composer) + D4 (welcome); component sections §4 (composer & bars) + §5 (welcome). Phases 1–2 are already on this branch.

**Scope note:** `ChatInput` / `ThinkingLevelSelect` live in the shared `chat-session` module → the composer change lands on both Chat and Coding. The welcome state is Chat-only; Coding's equivalent is `TaskDispatchCard`.

---

## File Structure

- `.../ChatInput/ChatInputView.tsx` — **Modify.** Wrap the textarea + a toolbar row (thinking select + Send/Stop) inside a glass capsule container.
- `.../ChatInput/styles.module.css` — **Modify.** Replace the flat row with the raised glass capsule + toolbar layout + one-shot focus glow.
- `.../ThinkingLevelSelect/styles.module.css` — **Modify.** Style the `Select.Trigger` as a glowing accent pill.
- `pages/chat/ChatPageView.tsx` — **Modify.** Replace the empty-state `<p>` with a glass pedestal glyph + single headline line.
- `modules/chat-session/styles.module.css` — **Modify.** Restyle `.emptyState` / `.emptyStateText` for the welcome mark (centered glyph + headline) and tune `.page` so the composer is visually centered on an empty session.
- `pages/coding/components/TaskDispatchCard/styles.module.css` — **Modify (light touch).** Align the dispatch card's surfaces/labels to the glass language so Coding's welcome matches.

No new components; one React component per file preserved.

---

## Pre-flight

- [ ] **Step 0: Confirm Phases 1–2 are in place and green**

```bash
cd apps/frontend && bun run test
```

Expected: PASS (200). For visual checks, ask the user before starting `bun dev` (they prefer to control it). When running, open `http://localhost:5173`, go to **Chat**: a new session (no messages) shows the welcome + composer; an existing session shows the composer at the bottom.

---

## Task 1: Composer glass capsule

Implements D3/§4. Group the textarea and a toolbar (thinking pill + Send/Stop) into one raised glass capsule with a one-shot focus glow.

**Files:**

- Modify: `.../ChatInput/ChatInputView.tsx`
- Modify: `.../ChatInput/styles.module.css`

- [ ] **Step 1: Restructure `ChatInputView.tsx` into capsule + toolbar**

Replace the returned JSX (keep imports and props) so the textarea sits above a toolbar row, all inside a capsule:

```tsx
return (
  <div className={styles.capsule}>
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
    <div className={styles.toolbar}>
      {showThinkingLevelSelect ? (
        <ThinkingLevelSelect
          value={thinkingLevel}
          isDisabled={isStreaming}
          onChange={onThinkingLevelChange}
        />
      ) : (
        <span />
      )}
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
  </div>
);
```

(The `<span />` placeholder keeps the Send button right-aligned via `justify-content: space-between` when there is no thinking select.)

- [ ] **Step 2: Replace `ChatInput/styles.module.css`**

```css
.capsule {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 12px 16px 16px;
  padding: 10px 12px;
  border-radius: 18px;
  background: var(--aurora-glass-fill);
  border: 1px solid var(--aurora-glass-border);
  box-shadow:
    var(--aurora-glass-highlight),
    0 10px 30px rgba(0, 0, 0, 0.18);
  transition:
    border-color 150ms ease,
    box-shadow 150ms ease;
}

/* One-shot focus glow: the capsule lifts when the textarea is focused,
   then settles. Event-driven (P3), not ambient. */
.capsule:focus-within {
  border-color: color-mix(
    in oklch,
    var(--accent) 45%,
    var(--aurora-glass-border)
  );
  box-shadow:
    var(--aurora-glass-highlight),
    0 0 0 1px color-mix(in oklch, var(--accent) 35%, transparent),
    0 12px 34px rgba(0, 0, 0, 0.22);
}

.textarea {
  width: 100%;
  resize: none;
  background: transparent;
  border: none;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

@media (prefers-reduced-motion: reduce) {
  .capsule {
    transition: none;
  }
}
```

- [ ] **Step 3: Verify the textarea sits cleanly inside the capsule**

The HeroUI `TextArea` renders its own input chrome. If the capsule shows a double border/background around the textarea, neutralize the inner field in this stylesheet by targeting the HeroUI slot:

```css
.textarea :global(.text-area),
.textarea :global(textarea) {
  background: transparent;
  border: none;
  box-shadow: none;
}
```

Add this only if the double-chrome appears in the browser check (Step 4). (HeroUI class names: confirm via devtools; `.text-area` is the slot used elsewhere in this repo's CSS-module `:global` overrides.)

- [ ] **Step 4: Browser check (both themes)**

In a session, the composer is a single raised glass capsule: textarea on top, a toolbar row beneath (thinking pill left when shown, Send right). Focusing the textarea lifts the capsule with an accent glow that settles; blur returns it. Stop button shows during streaming. Light + dark.

- [ ] **Step 5: Tests, lint, commit**

```bash
cd apps/frontend && bun run test && bun run lint
git add apps/frontend/src/modules/chat-session/components/ChatInput
git commit -m "feat(frontend): composer glass capsule with one-shot focus glow"
```

---

## Task 2: Thinking-level pill

Style the thinking `Select.Trigger` as a glowing accent pill so it reads as a glass control inside the capsule (§4 / D3).

**Files:**

- Modify: `.../ThinkingLevelSelect/styles.module.css`

- [ ] **Step 1: Add pill styling for the trigger**

Append to `.../ThinkingLevelSelect/styles.module.css`:

```css
.select :global(.select-trigger) {
  border-radius: 9999px;
  background: var(--aurora-glass-fill);
  border: 1px solid var(--aurora-glass-border);
  box-shadow: var(--aurora-glass-highlight);
  min-height: 32px;
  padding: 4px 12px;
}

.value {
  color: var(--accent);
}
```

(The existing `.value` flex rule stays; this adds the accent color. Class `.select-trigger` is HeroUI `Select.Trigger`'s slot — confirm in devtools during the check; if different, match the actual slot class.)

- [ ] **Step 2: Browser check (both themes)**

The thinking control reads as a rounded glass pill with an accent-tinted "Thinking: …" label + lightbulb icon. Opening the popover still works; selection updates the label. Light + dark.

- [ ] **Step 3: Tests, lint, commit**

```bash
cd apps/frontend && bun run test && bun run lint
git add apps/frontend/src/modules/chat-session/components/ThinkingLevelSelect/styles.module.css
git commit -m "feat(frontend): thinking-level control as glass accent pill"
```

---

## Task 3: Welcome state (Chat)

Implements D4/§5. Replace the plain centered text with a glass pedestal glyph + one headline line, composer centered beneath.

**Files:**

- Modify: `pages/chat/ChatPageView.tsx:88-95` (empty-state branch)
- Modify: `modules/chat-session/styles.module.css` (`.emptyState`, `.emptyStateText`, add glyph styles)

- [ ] **Step 1: Replace the empty-state markup in `ChatPageView.tsx`**

The empty branch currently renders a single `<p>`. Replace it with a glass mark + headline. First add a lucide icon import at the top of `ChatPageView.tsx`:

```tsx
import {MessagesSquare} from 'lucide-react';
```

Then replace the empty-state block (around lines 89-95):

```tsx
{
  isEmpty && !sessionId && (
    <div className={styles.emptyState}>
      <span className={styles.emptyGlyph} aria-hidden='true'>
        <MessagesSquare size={26} />
      </span>
      <p className={styles.emptyStateText}>Start a conversation</p>
      <p className={styles.emptyStateHint}>
        Ask anything, or describe a task to begin.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Restyle `.emptyState` + add glyph/hint in `modules/chat-session/styles.module.css`**

Replace `.emptyState` and `.emptyStateText` (lines 24-38) with:

```css
.emptyState {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  height: 100%;
  padding: 16px;
}

.emptyGlyph {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border-radius: 14px;
  color: var(--accent);
  background: var(--aurora-active-fill);
  border: 1px solid var(--aurora-glass-border);
  box-shadow: var(--aurora-glass-highlight);
}

.emptyStateText {
  font-size: 1.15em;
  font-weight: 600;
  color: var(--foreground);
  text-align: center;
  margin: 0;
}

.emptyStateHint {
  font-size: 0.9em;
  color: var(--muted);
  text-align: center;
  margin: 0;
}
```

- [ ] **Step 3: Browser check (both themes)**

On a new session (no messages), the panel shows a centered glass pedestal glyph (accent icon) + "Start a conversation" headline + muted hint, with the composer capsule beneath. Static (no animation). Light + dark.

- [ ] **Step 4: Tests, lint, commit**

```bash
cd apps/frontend && bun run test && bun run lint
git add apps/frontend/src/pages/chat/ChatPageView.tsx apps/frontend/src/modules/chat-session/styles.module.css
git commit -m "feat(frontend): minimal glass-mark welcome state for new chat"
```

---

## Task 4: Coding TaskDispatchCard — align to glass

Light-touch restyle so Coding's start screen matches the language (§5). The card keeps all structure/behavior; only surfaces/labels align to tokens.

**Files:**

- Modify: `pages/coding/components/TaskDispatchCard/styles.module.css`

- [ ] **Step 1: Audit the dispatch card's tokens**

```bash
cd apps/frontend/src/pages/coding/components/TaskDispatchCard && grep -nE 'var\(--color-|#[0-9a-fA-F]{3,6}|rgba?\(' styles.module.css || echo "CLEAN"
```

- [ ] **Step 2: Align any non-documented tokens**

For each hit from Step 1, switch to the documented token (`--foreground`, `--muted`, `--accent`, `--surface`, `--border`). The HeroUI `Card` itself stays opaque `--surface` (it is content inside the panel, per design-language §5 — do NOT make it glass). Only the label/emoji/link accents need alignment. If Step 1 prints `CLEAN`, skip this task's edits and note it in the commit.

- [ ] **Step 3: Browser check (both themes)**

Open Coding with no active session → the dispatch card reads coherently with the glass frame (opaque card surface is correct; labels/accents match). Light + dark.

- [ ] **Step 4: Tests, lint, commit (if changed)**

```bash
cd apps/frontend && bun run test && bun run lint
git add apps/frontend/src/pages/coding/components/TaskDispatchCard/styles.module.css
git commit -m "feat(frontend): align coding task-dispatch card to glass tokens"
```

(If Step 1 was `CLEAN`, skip the commit.)

---

## Task 5: Full-phase verification

- [ ] **Step 1: Chat — both themes**

New session: welcome glyph + headline + centered composer capsule. Existing session: composer capsule at bottom, focus glow fires once on focus and settles, thinking pill (where shown) reads as accent glass, Send/Stop correct. No console errors.

- [ ] **Step 2: Coding — both themes**

Composer capsule (shared) renders in an active coding session; dispatch card matches the language on the start screen.

- [ ] **Step 3: Reduced motion**

With OS reduced-motion on, the composer focus transition snaps (no animated glow).

- [ ] **Step 4: Final tests, lint, build**

```bash
cd apps/frontend && bun run test && bun run lint && bun run build
```

Expected: tests PASS (200), lint 0 errors, build succeeds.

- [ ] **Step 5:** Verification only — commit a `fix(frontend):` only if an adjustment was needed.

---

## Self-Review (completed by plan author)

**Spec coverage (Phase-3 portion):**

- D3 / §4 composer glass capsule (textarea + toolbar) → Task 1. ✓
- D3 one-shot focus glow, event-driven + reduced-motion → Task 1 step 2 (`:focus-within`, reduced-motion guard). ✓
- D3 thinking level as glowing accent pill → Task 2. ✓
- D3 Send gradient / Stop danger → preserved (HeroUI default `Button` / `variant='danger'`, unchanged in Task 1). ✓
- D4 / §5 minimal glass-mark welcome (glyph + single line) → Task 3. ✓
- §5 Coding TaskDispatchCard restyled to match → Task 4. ✓
- §4 TitleBar/BottomBar "light touch" → already token-clean from Phases 1–2 (BottomBar surfaces use documented tokens); no change needed this phase. Noted here so it is not forgotten — if a browser check reveals a mismatch, fix in Task 5 step 5.
- Both themes first-class (P4) → every browser-check step. ✓
- Accent precious (P5) → accent reserved for focus glow, thinking pill, Send, welcome glyph. ✓
- Tokens via `--aurora-*`, no raw values → Task 4 grep gate + capsule uses only `--aurora-*`/`--accent`. ✓

**Out of Phase 3 (correctly deferred / done):** message stream + tool cards (Phase 2); `ask_user`/`subagent`/`context-compaction` polish (follow-up).

**Placeholder scan:** No TBD/TODO. Two steps (Task 1 Step 3, Task 2 Step 1) are conditional-on-browser HeroUI slot overrides — these show the exact CSS to apply and the condition, which is appropriate because the slot class must be confirmed in devtools; not a placeholder. ✓

**Type/selector consistency:** New classes (`.capsule`, `.textarea`, `.toolbar`, `.emptyGlyph`, `.emptyStateHint`) are all defined in the same task's CSS. `MessagesSquare` is a valid lucide-react icon. `ThinkingLevelSelect`, `Button`, `TextArea` import paths unchanged. All `--aurora-*` tokens referenced exist in `aurora-glass.css`. ✓

**Testing note:** No new logic; verified in-browser, existing Vitest suite is the regression guard. No view test asserts on the composer/empty markup (confirmed: ChatInput has no test; ChatPage.test.tsx tests page behavior, not the empty-state DOM — verify during Task 3 and update if an assertion references the old `<p>`).
