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

The empty new-session state is a **glass pedestal glyph + a short headline
and one line of hint text**, with the composer centered beneath. Calm and
on-brand; deliberately does **not** introduce a starter-prompt library (that
would be a separate
product decision).

### D5 — Tool cards: quiet pills, B-tier glass on expand

Collapsed tool calls are **quiet pills** (nearly text, no card border) so
tool-heavy turns stay scannable. On expand, the **card shell becomes
translucent glass** while **inner code/terminal/diff blocks stay opaque** for
readability ("B-tier"). This is a deliberate narrow amendment to
design-language §5 — see §3a and the Tokens amendment note.

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

**Stronger Mica panel (frame tuning).** Verified against the real canvas, the
current Mica recipe reads slightly flat. Tune `--aurora-mica-fill` /
`--aurora-mica-blur` / `--aurora-mica-border` to a more translucent, more
blurred, more saturated recipe so the canvas colour-drift shows through and
the panel feels genuinely glassy. This lives in `aurora-glass.css` and so
lifts the **whole frame** (all pages), not just Chat — apply to both themes.

**Design-language amendment (tool-card shells).** Design-language §5 currently
says Mica is frame-only and all in-panel content stays opaque. This redesign
narrows that: **the tool-card shell may be translucent glass, but any
text-bearing block inside it (code, terminal, diff, JSON) stays opaque.** The
"never glass the readable text" intent is preserved; only the card chrome
becomes glass. `docs/design-language.md` §5/§6.x must be updated to record
this when the work lands.

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

### 3a. Tool cards (the in-stream tool-execution subsystem)

Tool calls are a large share of the conversation surface, so they get their
own treatment rather than a hand-wave. All 11 tool renderers share one shell
(`ToolExecutionCard`) with two states:

**Collapsed pill (the dominant element).** What fills most of a tool-heavy
turn: a status icon + tool display-name + a muted target (e.g. file path,
command, `"pattern" · N matches`). The pill is **quiet by default** — nearly
text, no card border, blending into the unboxed assistant prose; a faint
glass hover wash + the expand chevron are the only chrome. Status icons:
running `Spinner`, done `CircleCheck`, failure `CircleAlert` (warning), error
`CircleX` (danger). This keeps long tool sequences scannable and honors
"accent is precious."

**Expanded glass card.** On expand, the shell becomes a **B-tier glass card**
(decided via mockup): the card _shell_ is translucent glass + `backdrop-filter`
(`--aurora-glass-fill` / `--aurora-glass-border`, blends into the Mica), but
the **inner code/terminal/diff blocks keep a solid opaque background** for
contrast and to avoid running `backdrop-filter` on every line. This is a
deliberate, narrow amendment to design-language §5 (see "Design-language
amendment" below) — glass on the card shell, never on the text-bearing blocks.

**Body archetypes.** The 11 renderers collapse into four visual patterns;
restyle each to Aurora tokens, structure unchanged:

1. **Diff** (`edit_file`) — diff2html add/remove/context lines in an opaque
   code frame; add = success tint, remove = danger tint.
2. **Terminal** (`run_command`) — `$ command` + stdout/stderr in opaque mono
   blocks, with an exit-code badge (`exit 0` success / `exit N` danger /
   `timed out` warning).
3. **File list** (`find_files`, `search_files`) — file/line rows, mono, with
   the matched substring accent-highlighted.
4. **Web results** (`web_search`, `web_fetch`) — title (accent) / url
   (success-tinted mono) / snippet (muted) rows.
   `read_file`, `write_file`, `load_skill`, `get_current_time`, and the
   `HighlightedJson` fallback reuse these same patterns.

**`ThinkingBlock`** follows the same quiet-pill → glass-card pattern as the
tool cards, for consistency.

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
  glass pedestal glyph + a short headline and one hint line; composer centered
  beneath.
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
- Tool calls: collapsed pills read as quiet near-text with correct status
  icons; on expand the card shell is glass while code/terminal/diff blocks stay
  opaque and legible; all four body archetypes (diff, terminal, file list, web)
  render correctly over the canvas.
- Stronger Mica: the panel shows canvas colour-drift (not flat grey) in both
  themes, and content inside stays readable.
- Composer capsule: focus glow fires once and settles; thinking pill + Send
  read correctly; Stop state during streaming.
- Welcome state (Chat) and restyled TaskDispatchCard (Coding) on a new session.
- Resting UI fully static; `prefers-reduced-motion` snaps all transitions.
- Existing tests pass; build + lint clean.
