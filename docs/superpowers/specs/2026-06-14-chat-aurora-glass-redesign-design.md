# Chat Redesign — Aurora Glass Conversation Surface

**Date:** 2026-06-14
**Status:** Approved (design)
**Design language:** Conforms to `apps/frontend/docs/design-language.md`
("Aurora Glass") and the frame redesign
`docs/superpowers/specs/2026-06-14-aurora-glass-frame-design.md`. The app
frame is the reference implementation; this brings the Chat feature up to the
same visual language.

## Goal

Restyle the Chat feature so it reads as a premium, "科技感" native-desktop
conversation surface coherent with the new Aurora Glass frame. Resolve the
visual redundancy of two stacked left columns (global nav rail + an opaque
in-panel session list), and elevate the message stream, composer, and empty
state from their current flat/plain treatment.

## Scope

Covers the `chat-session` module and the two pages that compose it
(`pages/chat`, `pages/coding`). **The `chat-session` module is shared by both
Chat and Coding** — every change here intentionally lands on both pages to
keep them coherent. Out of scope: backend, message/event data flow, and the
global frame (already done).

## Locked Decisions (from visual brainstorming)

All four were chosen by the user against mockups in the real Aurora Glass
dark palette.

### D1 — Session history: left glass column

The session list **stays on the left** (familiar; the right edge is
deliberately reserved for a possible future inspector/context panel). It is
restyled from an opaque slab into a **transparent glass column over the Mica
panel**: no opaque background, no hard right border — the panel reads as one
continuous surface. The existing collapse toggle is kept, so a wide,
list-free chat is still one click away.

### D2 — Messages: bare assistant, glass user bubble

Assistant replies flow as **open full-width text** (best for long answers,
markdown, code blocks, and the existing tool-execution / thinking cards),
marked by a small `Assistant` label + a glass dot. **Only the user's turns**
get a glass accent bubble (right-aligned). This is the premium-AI-tool
pattern and avoids capping the reading measure of long answers.

### D3 — Composer: floating glass capsule

The input area becomes a single **raised glass capsule** (`--aurora-glass-fill`,
inset top highlight, soft outer shadow) housing the textarea, the
thinking-level control (as a glowing accent pill), and the gradient Send
button — a "command console" focal point. Focus triggers a one-shot glow that
settles; no ambient motion.

### D4 — Welcome state: minimal glass mark

The empty new-session state is a **glass pedestal glyph + a single headline
line**, with the composer centered beneath. Calm and on-brand; deliberately
does **not** introduce a starter-prompt library (that would be a separate
product decision).

## Component-Level Design

### 1. Tokens (foundation)

Chat components currently mix two token systems — the documented Aurora/HeroUI
base set (`--surface`, `--accent`, `--muted`, `--foreground`) and HeroUI's
prefixed set (`--color-foreground-400`, `--color-segment`, `--color-background`).
Standardize on the **documented Aurora set** used by the frame, and consume
existing `--aurora-*` glass tokens instead of raw values.

- If a surface needs a value not yet in `aurora-glass.css` (e.g. a composer
  capsule shadow), **add it there for BOTH themes** (P4 — reinterpret per
  theme, never port a dark effect onto light unchanged). Never inline raw
  rgba/gradients into a component.
- No new token unless a component genuinely needs it; prefer reuse.

### 2. SessionSidebar — left glass column

- **`components/CollapsibleSidebar`** (shared shell): remove the opaque
  `background-color: var(--color-background)` and the hard `border-right`;
  the column becomes transparent over the Mica. Preserve the width/opacity
  collapse animation and the header collapse/expand toggle (event-driven
  transitions are fine).
- **`SessionItem` rows:** resting = transparent fill + `--muted` text, static.
  Hover = faint `--aurora-glass-fill` wash + text lift toward `--foreground`.
  Active/selected = `--aurora-active-fill` + `--aurora-glass-highlight` + the
  glowing accent **left bar** (`--aurora-active-bar` / `-glow`) — the SAME
  visual grammar as the nav-rail active item, so navigation selection and
  history selection feel like one system. Delete action + popover keep current
  behavior, restyled to tokens.
- Loading / error / empty states restyled to Aurora tokens (`--muted`,
  `--danger`).

### 3. Message stream

- **`MessageBubble`:**
  - Assistant → drop the bubble. Render as bare full-width text with a small
    `Assistant` label + glass dot marker. Preserve the waiting `WorkingIndicator`
    and skeleton states.
  - User → glass accent capsule (`--aurora-glass-fill` tinted by accent +
    `--aurora-glass-border` + soft accent shadow), right-aligned.
- **`MessageList`:** widen the reading measure now that assistant text is
  unboxed; tune vertical rhythm for the label+text pattern and the gap between
  turns.
- **Tool / thinking surfaces** (`ToolExecutionCard`, `ThinkingBlock`,
  result/parameter cards): keep their existing structure and interactions —
  only align their surface fills, borders, and code-block backgrounds to the
  Aurora glass tokens so they sit naturally in the unboxed assistant flow.

### 4. Composer & bars

- **`ChatInput`:** compose the `TextArea`, `ThinkingLevelSelect`, and Send/Stop
  buttons into one raised glass capsule. Thinking level → glowing accent pill;
  Send → keep accent gradient; Stop → keep danger treatment. One-shot focus
  glow that settles (respect `prefers-reduced-motion`).
- **`TitleBar`:** light touch — align typography/spacing to the language; keep
  the new-session and VSCode actions.
- **`BottomBar`** (`TodoPanel` + `InfoBar` + `UsageInfo`): align surfaces to
  glass tokens; no structural change.

### 5. Welcome / empty state

- **`ChatPageView`** empty branch: replace the plain centered `<p>` with a
  glass pedestal glyph + single headline line; composer centered beneath.
- **`CodingPageView`** keeps its `TaskDispatchCard`, restyled to match the
  glass language (it is the Coding equivalent of the welcome state).

## Constraints

- CSS Modules only; **no Tailwind utility classes** in our components.
- Reuse HeroUI (`Button`, `Tooltip`, `ListBox`, `TextArea`, `Popover`,
  `ScrollShadow`, `Spinner`) + theme tokens; hand-roll only where HeroUI
  styling blocks the aesthetic (P6).
- **Motion is event-driven only** (P3): hover/focus/selection transitions that
  fire and settle. No looping/ambient animation anywhere. All motion honors
  `prefers-reduced-motion` by snapping to the final state.
- **Both light and dark are first-class** (P4): every new surface gets a
  per-theme recipe in `aurora-glass.css`; never port a dark glow onto light.
- **Accent is precious** (P5): accent reserved for the active session, the
  user bubble, and the primary Send action.
- MVVM structure preserved; views stay stateless; no `any`; follow TS +
  file-naming conventions. One React component per file.
- Do not redraw brand assets.

## Verification

Manual browser review in **both themes**, across **Chat and Coding**:

- Session column reads as transparent glass over the Mica (no opaque slab /
  hard border); hover and active row states match the nav-rail grammar;
  collapse toggle still works.
- Assistant messages render as bare full-width text; user turns as glass accent
  bubbles; tool/thinking cards sit naturally in-flow.
- Composer capsule: focus glow fires once and settles; thinking pill + Send
  read correctly; Stop state during streaming.
- Welcome state (Chat) and restyled TaskDispatchCard (Coding) on a new session.
- Resting UI fully static; `prefers-reduced-motion` snaps all transitions.
- Existing tests pass; build + lint clean.
