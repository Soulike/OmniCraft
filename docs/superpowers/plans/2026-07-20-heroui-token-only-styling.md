# HeroUI Token-Only Styling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every component's global appearance flow from a single source — HeroUI's own theme tokens — deleting all custom-token + raw-CSS overrides that scatter component styling across many files.

**Architecture:** `aurora-glass.css` is dissolved. `heroui-overrides.css` becomes the _only_ place HeroUI semantic tokens are customized (an opaque, aurora-toned `--surface`/`--border` set). Every component — HeroUI-based and hand-rolled — consumes only HeroUI tokens (`--surface`, `--border`, `--accent-soft`, `--surface-shadow`, …), never `--aurora-*`. The single exception is the app frame (`_layout`), which keeps the background gradient + Mica backdrop-blur as its own component-internal styles (not global tokens). Everything else Aurora that cannot be expressed as a HeroUI token (translucency, glass blur, highlight bevels, glows, sheen) is deleted.

**Tech Stack:** React 19 + Vite, HeroUI v3 (`@heroui/react` + `@heroui/styles`), Tailwind CSS v4 (present only as HeroUI's engine), CSS Modules for component styles, Vitest for tests.

## Global Constraints

- Package manager is **PNPM**. Run scripts via `pnpm --filter '@omnicraft/frontend' run <script>` (e.g. `... run typecheck`, `... run lint`, `... run test`). Start the dev server from the repo root with `pnpm dev`.
- Do **NOT** use Tailwind utility classes in our own components. When customizing a HeroUI component globally via its documented BEM classes, write **plain CSS** inside `@layer components` — never `@apply`.
- Custom `--aurora-*` design tokens may be consumed by **no file** after this plan (the file that defined them is deleted). During the migration, no new `--aurora-*` reference may be added.
- **Single source of truth:** HeroUI semantic-token customization lives **only** in `apps/frontend/src/heroui-overrides.css`. No component CSS Module may redefine a HeroUI semantic token.
- Every component consumes HeroUI tokens (`var(--surface)`, `var(--border)`, `var(--accent)`, `var(--accent-soft)`, `var(--muted)`, `var(--surface-shadow)`, `var(--overlay)`, radii `var(--radius-*)`) or its own local module classes only.
- The frame (`_layout`) is the sole exception permitted to hold bespoke material (gradient + backdrop-blur), and it holds it as component-internal CSS, not as shared tokens.
- Never use `any` (TS). Follow the Google TypeScript style already in the repo.
- After every task that changes UI, verify in a real browser in **both light and dark themes** before marking the task done.

**Standard per-task verification** (referenced as "run the standard checks" below):

```bash
pnpm --filter '@omnicraft/frontend' run typecheck
pnpm --filter '@omnicraft/frontend' run lint
pnpm --filter '@omnicraft/frontend' run test
```

Then, from repo root, `pnpm dev`, open the app, and visually confirm the affected screens in light **and** dark (toggle the theme switch).

---

## File Structure

Files created / deleted / heavily modified by this plan:

- `apps/frontend/src/index.css` — MODIFY: host the two typography tokens (`--font-display`, `--font-ui`); drop the `@import './aurora-glass.css'` at the end.
- `apps/frontend/src/heroui-overrides.css` — REWRITE: the single HeroUI-token customization file; opaque aurora-toned `--surface`/`--surface-secondary`/`--surface-tertiary`/`--field-background`/`--border` (light + dark). Optionally the ListBox selected-item accent bar as documented BEM.
- `apps/frontend/src/aurora-glass.css` — DELETE (last migration task).
- `apps/frontend/src/pages/_layout/styles.module.css` — MODIFY: inline the gradient canvas + Mica values as component-internal, theme-scoped CSS.
- ListBox consumers — MODIFY: `modules/chat-session/components/SessionList/{styles.module.css, SessionListView.tsx}`, `.../SessionList/components/SessionItem/{SessionItem.tsx, SessionItemView.tsx, styles.module.css}`, `pages/coding/components/WorkspaceSessionList/components/WorkspaceGroup/styles.module.css`.
- `modules/chat-session/components/ChatInput/{ChatInputView.tsx, styles.module.css}` — MODIFY.
- Glass-card cluster CSS Modules (Task 6/7) — MODIFY: `modules/chat-ui-components/components/{ThinkingBlock,ContextCompactionBlock,TodoCard,AssistantMessage,UserMessage,AskUserCard}/styles.module.css` and `AskUserCard/components/{CancelledCard,CompletedCard}/styles.module.css`; `modules/tool-ui/styles.module.css`; `modules/chat-stream/components/MessageList/components/SubagentDisclosure/styles.module.css`; `pages/chat/styles.module.css`.
- Nav / custom-component effects (Task 8) — MODIFY: `pages/_layout/components/Sidebar/styles.module.css`, `.../Sidebar/components/NavItemLink/styles.module.css`, `components/StatusTimeline/styles.module.css`.
- `apps/frontend/docs/design-language.md` — DELETE.
- `apps/frontend/CLAUDE.md` — MODIFY: replace the "Design Language" section (which instructs reading the deleted doc) with the token-only rule.

**Ordering rationale:** `aurora-glass.css` can only be deleted once _nothing_ references `--aurora-*` or `--font-*`. So typography (Task 1), the frame (Task 3), and every glass/active consumer (Tasks 4–8) migrate first; the file is deleted in Task 9. The app stays working and coherent at every commit — cards keep their glass until their own task flattens them, because `aurora-glass.css` still exists until the end.

---

### Task 1: Relocate typography tokens out of `aurora-glass.css`

`--font-display` / `--font-ui` are the app's own typography tokens (not HeroUI tokens, not material). They must leave `aurora-glass.css` so that file ends up with material-only content (and can later be deleted). Home: `index.css` `:root` (global; `body` and a few components already read them).

**Files:**

- Modify: `apps/frontend/src/index.css`
- Modify: `apps/frontend/src/aurora-glass.css` (remove the two font tokens only)

**Interfaces:**

- Produces: global CSS variables `--font-display`, `--font-ui` defined on `:root` in `index.css`. Consumers unchanged (`var(--font-ui)` / `var(--font-display)` still resolve).

- [ ] **Step 1: Add the font tokens to `index.css`**

Edit `apps/frontend/src/index.css` to add a `:root` block holding the two stacks (copied verbatim from the current `aurora-glass.css`), before the `body` rule:

```css
@import 'tailwindcss';
@import '@heroui/styles';
@import './heroui-overrides.css';
@import './aurora-glass.css';

:root {
  /* App typography tokens: self-hosted Latin design fonts first, OS CJK
     fallback after (we do not self-host a CJK webfont). */
  --font-display:
    'Bricolage Grotesque Variable', 'PingFang SC', 'Microsoft YaHei',
    'Noto Sans CJK SC', sans-serif;
  --font-ui:
    'Sora Variable', 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC',
    sans-serif;
}

body {
  min-height: 100dvh;
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-ui);
}

#root {
  min-height: 100dvh;
}
```

- [ ] **Step 2: Remove the font tokens from `aurora-glass.css`**

Delete the `--font-display` and `--font-ui` declarations (the block near the top of the `:root { … }` in `apps/frontend/src/aurora-glass.css`). Leave `--aurora-glass-blur` and everything else in that file untouched for now.

- [ ] **Step 3: Confirm no other definition of the font tokens remains**

Run: `grep -rn -- '--font-display\|--font-ui' apps/frontend/src`
Expected: definitions appear **only** in `apps/frontend/src/index.css`; all other hits are `var(--font-*)` consumers.

- [ ] **Step 4: Run the standard checks + browser verify**

Fonts must render identically (headings in Bricolage, UI in Sora), both themes. No visual change expected.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/index.css apps/frontend/src/aurora-glass.css
git commit -m "refactor(frontend): move typography tokens from aurora-glass.css to index.css"
```

---

### Task 2: Rewrite `heroui-overrides.css` as the single token home (opaque, aurora-toned)

Replace the translucent surface/border overrides with **opaque** aurora-toned equivalents. This is the one file allowed to customize HeroUI semantic tokens. Translucency is gone; the tone (a faint cool cast) is preserved so surfaces don't read as flat HeroUI white/grey.

**Files:**

- Modify (full rewrite): `apps/frontend/src/heroui-overrides.css`

**Interfaces:**

- Produces: opaque values for `--surface`, `--surface-secondary`, `--surface-tertiary`, `--field-background`, `--border` in `:root.light` and `:root.dark`. All downstream components read these via `var(--surface)` etc.

- [ ] **Step 1: Replace the file contents**

Write `apps/frontend/src/heroui-overrides.css`:

```css
/**
 * HeroUI token overrides — THE single source of HeroUI component styling.
 *
 * Rule (enforced project-wide): HeroUI semantic tokens are customized ONLY
 * here. No component CSS Module may redefine a HeroUI token, reach into
 * HeroUI internals, or paint bespoke material. Components consume HeroUI
 * tokens (var(--surface), var(--border), var(--accent-soft), ...) and get
 * their look from this file.
 *
 * Must be imported AFTER `@heroui/styles` so these win over the defaults.
 *
 * We keep a faint cool "aurora" cast on surfaces/borders, but OPAQUE — no
 * translucency, no backdrop-filter (those were removed by design). The frame
 * (_layout) is the only place allowed to carry gradient + Mica blur, as
 * component-internal CSS, not tokens.
 *
 * NOTE: these color values are starting points; tune in-browser in both
 * themes. Keep light and dark equally polished.
 */

:root.light {
  --surface: rgb(253, 254, 255);
  --surface-secondary: rgb(244, 246, 252);
  --surface-tertiary: rgb(238, 241, 250);
  --field-background: rgb(255, 255, 255);
  --border: rgb(224, 228, 234);
}

:root.dark {
  --surface: rgb(31, 34, 47);
  --surface-secondary: rgb(38, 40, 55);
  --surface-tertiary: rgb(44, 48, 64);
  --field-background: rgb(31, 34, 47);
  --border: rgb(41, 44, 59);
}
```

- [ ] **Step 2: Run the standard checks + browser verify**

Expected: surfaces (cards, inputs, popovers) are now **opaque** with a faint cool tint; borders are hairline but visible. Cards that still add their own `--aurora-glass-*` (until Tasks 6/7) will look slightly layered on top — that is expected intermediate state, not a bug. Verify both themes; tune the six values above in the browser until surfaces read clean and legible.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/heroui-overrides.css
git commit -m "refactor(frontend): make heroui-overrides.css the single opaque token home"
```

---

### Task 3: Internalize the frame (gradient canvas + Mica) into `_layout`

The frame's gradient background and Mica backdrop-blur have no HeroUI token equivalent and are the app's identity, so they stay — but as `_layout`'s **component-internal** CSS, not global `--aurora-*` tokens. Copy the current values (light + dark) from `aurora-glass.css` into `_layout/styles.module.css`, theme-scoped.

**Files:**

- Modify: `apps/frontend/src/pages/_layout/styles.module.css`

**Interfaces:**

- Consumes: nothing from `aurora-glass.css` after this task.
- Produces: the frame renders identically (canvas gradient + Mica-blurred panel), driven by values local to this module.

- [ ] **Step 1: Read the current frame styles and the canvas/mica values**

Read `apps/frontend/src/pages/_layout/styles.module.css` (it currently uses `var(--aurora-canvas)`, `var(--aurora-mica-fill)`, `var(--aurora-mica-blur)`, `var(--aurora-mica-border)`). Read the light and dark values of those four tokens from `apps/frontend/src/aurora-glass.css`.

- [ ] **Step 2: Define theme-scoped local values on the layout root and consume them**

In `_layout/styles.module.css`, introduce local custom properties on the layout root class, scoped by the theme classes on `:root`, and replace the `var(--aurora-*)` usages with the locals. Use the exact gradient/blur/color values currently in `aurora-glass.css` (light block and dark block). Pattern:

```css
/* Frame-only material. Lives here on purpose: gradient + backdrop-blur have
   no HeroUI token, so the frame owns them as component-internal styles. */
.layout {
  /* light values (copy verbatim from the old aurora-glass.css :root.light) */
  --frame-canvas: /* the multi-stop radial-gradient(...) , var(--background) */;
  --frame-mica-fill: rgba(255, 255, 255, 0.6);
  --frame-mica-blur: blur(72px) saturate(1.7);
  --frame-mica-border: 1px solid rgba(255, 255, 255, 0.7);
}

:root.dark .layout {
  /* dark values (copy verbatim from the old aurora-glass.css :root.dark) */
  --frame-canvas: /* the dark multi-stop radial-gradient(...) , var(--background) */;
  --frame-mica-fill: rgba(18, 20, 30, 0.52);
  --frame-mica-blur: blur(72px) saturate(1.8);
  --frame-mica-border: 1px solid rgba(160, 180, 255, 0.16);
}
```

Then change the existing declarations in this module from `var(--aurora-canvas)` → `var(--frame-canvas)`, `var(--aurora-mica-fill)` → `var(--frame-mica-fill)`, `-blur` and `-border` likewise. (If the layout root class is named other than `.layout`, use the actual class the module applies to the layout root element.)

- [ ] **Step 3: Confirm the frame no longer references aurora**

Run: `grep -n -- '--aurora' apps/frontend/src/pages/_layout/styles.module.css`
Expected: no matches.

- [ ] **Step 4: Run the standard checks + browser verify**

Expected: the frame looks **identical** to before — gradient canvas visible in the gap around the panel, panel is Mica-blurred, both themes.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/_layout/styles.module.css
git commit -m "refactor(frontend): internalize frame canvas + Mica into _layout module"
```

---

### Task 4: Migrate ListBox styling off `:global()` internals (SessionList + WorkspaceGroup)

Remove every `:global(.list-box*)` reach-in. Selected/hover come from HeroUI's own state styling driven by tokens; cross-component state (icon color, action reveal) comes from `ListBox.Item`'s render-prop children passing `isSelected` into `SessionItem`, plus `SessionItem`'s own `:hover`.

**Files:**

- Modify: `apps/frontend/src/modules/chat-session/components/SessionList/SessionListView.tsx`
- Modify: `apps/frontend/src/modules/chat-session/components/SessionList/styles.module.css`
- Modify: `apps/frontend/src/modules/chat-session/components/SessionList/components/SessionItem/SessionItem.tsx`
- Modify: `apps/frontend/src/modules/chat-session/components/SessionList/components/SessionItem/SessionItemView.tsx`
- Modify: `apps/frontend/src/modules/chat-session/components/SessionList/components/SessionItem/styles.module.css`
- Modify: `apps/frontend/src/pages/coding/components/WorkspaceSessionList/components/WorkspaceGroup/styles.module.css`

**Interfaces:**

- Consumes: `ListBox.Item` render-prop children `({ isSelected }: { isSelected: boolean }) => ReactNode` (HeroUI public API).
- Produces: `SessionItem` gains a prop `isSelected: boolean`; `SessionItemView` gains `isSelected: boolean`.

- [ ] **Step 1: Pass `isSelected` through the ListBox render-prop**

In `SessionListView.tsx`, change the `ListBox.Item` child from a plain element to a render function and give the item a scoped className:

```tsx
<ListBox.Item
  key={session.id}
  id={session.id}
  textValue={session.title}
  className={styles.item}
>
  {({isSelected}) => (
    <SessionItem
      title={session.title}
      isSelected={isSelected}
      onDelete={async () => onDeleteSession(session.id)}
    />
  )}
</ListBox.Item>
```

- [ ] **Step 2: Thread `isSelected` through `SessionItem` → `SessionItemView`**

In `SessionItem.tsx` add `isSelected: boolean` to `SessionItemProps` and pass it to `SessionItemView`. In `SessionItemView.tsx` add `isSelected: boolean` to `SessionItemViewProps`, and drive the icon color and the row's own hover from the component's own classes (no `:global`):

```tsx
<div className={styles.item}>
  <div className={clsx(styles.icon, isSelected && styles.iconSelected)}>
    <MessageSquare size={14} fill='currentColor' strokeWidth={1.5} />
  </div>
  {/* ...content and actions unchanged... */}
</div>
```

(Import `clsx` — already a dependency.)

- [ ] **Step 3: Rewrite `SessionList/styles.module.css` without `:global`**

`.item` here is the className on `ListBox.Item` (Step 1). Style base + selected on it via HeroUI's public state attribute `data-selected`, and hover via HeroUI's `data-hovered`/`:hover`:

```css
.listBox {
  padding: 0;
}

.item {
  position: relative;
  border-radius: var(--radius-lg);
  padding: 6px 10px;
  min-height: unset;
  font-size: 0.85rem;
  color: var(--muted);
  transition:
    color 150ms ease,
    background 150ms ease;
}

.item[data-hovered='true'] {
  color: var(--foreground);
  background: var(--surface-secondary);
}

.item[data-selected='true'] {
  color: var(--foreground);
  background: var(--accent-soft);
  font-weight: 500;
}

.item[data-selected='true']::before {
  content: '';
  position: absolute;
  left: 0;
  top: 25%;
  height: 50%;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--accent);
}

.centered {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 8px;
}

.errorText {
  font-size: 0.8rem;
  color: var(--danger);
}

.emptyText {
  font-size: 0.8rem;
  color: var(--muted);
}

@media (prefers-reduced-motion: reduce) {
  .item {
    transition: none;
  }
}
```

- [ ] **Step 4: Rewrite `SessionItem/styles.module.css` without `:global`**

Replace the two `:global(.list-box-item...)` rules with the component's own state:

```css
.item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
}

.icon {
  flex-shrink: 0;
  color: var(--muted);
  display: flex;
  align-items: center;
}

.iconSelected {
  color: var(--accent);
}

.content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.title {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.actions {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 150ms ease;
}

.item:hover .actions,
.item:focus-within .actions {
  opacity: 1;
}

.popoverBody {
  margin-top: 8px;
  font-size: 0.85rem;
  color: var(--muted);
}

.popoverActions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}
```

- [ ] **Step 5: Rewrite the WorkspaceGroup ListBox rule without `:global`**

In `WorkspaceGroup/styles.module.css`, its `ListBox.Item`s need the same `className={styles.item}` treatment. Give the group's `ListBox.Item` (in `WorkspaceGroup`'s View) a `className`, then replace the `.listBox :global(.list-box-item[data-selected='true'])` rule with:

```css
.item[data-selected='true'] {
  background: var(--accent-soft);
  border-radius: var(--radius-lg);
}
```

Remove the `var(--aurora-*)` usages here.

- [ ] **Step 6: Confirm no ListBox `:global` or aurora remains**

Run: `grep -rn 'list-box\|--aurora' apps/frontend/src/modules/chat-session/components/SessionList apps/frontend/src/pages/coding/components/WorkspaceSessionList`
Expected: no matches.

- [ ] **Step 7: Run the standard checks + browser verify**

Expected: session list + workspace group items — resting muted, hover lifts to foreground with a `--surface-secondary` fill, selected shows `--accent-soft` fill + `--accent` left bar + accent icon; delete action reveals on hover/focus. Both themes.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/modules/chat-session/components/SessionList apps/frontend/src/pages/coding/components/WorkspaceSessionList
git commit -m "refactor(frontend): style ListBox via HeroUI tokens + render-props, drop :global internals"
```

---

### Task 5: Migrate ChatInput (TextArea `variant`, drop `:global(.textarea)`)

Replace the `.textarea:global(.textarea)` specificity hack with HeroUI's `variant="secondary"`. Flatten the hand-rolled `.capsule` from glass to an opaque token surface; keep a token-driven focus lift (accent ring), drop blur/highlight.

**Files:**

- Modify: `apps/frontend/src/modules/chat-session/components/ChatInput/ChatInputView.tsx`
- Modify: `apps/frontend/src/modules/chat-session/components/ChatInput/styles.module.css`

- [ ] **Step 1: Use `variant="secondary"` on the TextArea**

In `ChatInputView.tsx`, add `variant='secondary'` to the `<TextArea>` (keeps `className={styles.textarea}`):

```tsx
<TextArea
  aria-label='Chat message'
  className={styles.textarea}
  variant='secondary'
  placeholder='Type a message... (Enter to send, Shift+Enter for newline)'
  rows={1}
  value={input}
  disabled={isStreaming}
  onChange={(e) => {
    onInputChange(e.target.value);
  }}
  onKeyDown={onKeyDown}
/>
```

- [ ] **Step 2: Rewrite `ChatInput/styles.module.css` on tokens**

```css
.capsule {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 12px 16px 16px;
  padding: 10px 12px;
  border-radius: var(--radius-2xl);
  background: var(--surface);
  border: 1px solid var(--border);
  box-shadow: var(--surface-shadow);
  transition:
    border-color 150ms ease,
    box-shadow 150ms ease;
}

/* One-shot focus lift: accent ring on focus, then settles. Token-driven. */
.capsule:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}

.textarea {
  width: 100%;
  resize: none;
  background: transparent;
  border: none;
  box-shadow: none;
}

.textarea:focus,
.textarea:focus-visible {
  outline: none;
  box-shadow: none;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

@media (prefers-reduced-motion: reduce) {
  .capsule {
    transition: none;
  }
}
```

(`.textarea` is a local module class on the TextArea root — CSS Modules are unlayered, so they win over HeroUI's layered `.textarea` at equal specificity; no `:global` needed. Confirm the focus ring is gone in-browser; if HeroUI's secondary variant still shows one, the local `.textarea:focus-visible { box-shadow: none }` above already neutralizes it.)

- [ ] **Step 3: Confirm no aurora / no `:global` remains**

Run: `grep -n -- '--aurora\|:global' apps/frontend/src/modules/chat-session/components/ChatInput/styles.module.css`
Expected: no matches.

- [ ] **Step 4: Run the standard checks + browser verify**

Expected: composer capsule is an opaque surface with hairline border; focusing the textarea lifts an accent ring once and settles; no inner border/shadow from the TextArea. Both themes.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/modules/chat-session/components/ChatInput
git commit -m "refactor(frontend): ChatInput via TextArea variant + tokens, drop :global textarea hack"
```

---

### Task 6: Flatten glass cards — chat-ui-components cluster

These are hand-rolled wrappers that paint `--aurora-glass-*` (and `backdrop-filter`) on themselves. Replace glass with opaque token surfaces; delete blur and highlight bevels. The look changes from "frosted layered sheet" to "clean opaque card" — this is the intended trade.

**Transform rule (apply to each file below):**

- `background: var(--aurora-glass-fill)` → `background: var(--surface-secondary)`
- `border: 1px solid var(--aurora-glass-border)` → `border: 1px solid var(--border)`
- `box-shadow: var(--aurora-glass-highlight)` → **delete** the declaration (highlight bevel has no token)
- `backdrop-filter: var(--aurora-glass-blur)` and its `-webkit-` twin → **delete** both
- any `background: var(--aurora-active-fill)` → `background: var(--accent-soft)`

**Files (each: replace per the rule above, then confirm no `--aurora` remains):**

- `apps/frontend/src/modules/chat-ui-components/components/ThinkingBlock/styles.module.css` — the `.card:has(.trigger[aria-expanded='true'])` block and `.trigger:hover` (`--aurora-glass-fill` → `--surface-secondary`).
- `apps/frontend/src/modules/chat-ui-components/components/ContextCompactionBlock/styles.module.css` — same shape as ThinkingBlock.
- `apps/frontend/src/modules/chat-ui-components/components/TodoCard/styles.module.css` — `.card` glass block.
- `apps/frontend/src/modules/chat-ui-components/components/AssistantMessage/styles.module.css` — the marker/sigil circle (`--aurora-glass-*`).
- `apps/frontend/src/modules/chat-ui-components/components/UserMessage/styles.module.css` — `.userBubble` glass.
- `apps/frontend/src/modules/chat-ui-components/components/AskUserCard/styles.module.css` — `.card` glass.
- `apps/frontend/src/modules/chat-ui-components/components/AskUserCard/components/CancelledCard/styles.module.css`
- `apps/frontend/src/modules/chat-ui-components/components/AskUserCard/components/CompletedCard/styles.module.css`

- [ ] **Step 1: Apply the transform rule to each file listed above**

For each file, open it, apply every bullet of the transform rule to each matching declaration. Example — `ThinkingBlock/styles.module.css` before:

```css
.card:has(.trigger[aria-expanded='true']) {
  background: var(--aurora-glass-fill);
  border: 1px solid var(--aurora-glass-border);
  box-shadow: var(--aurora-glass-highlight);
  backdrop-filter: var(--aurora-glass-blur);
  -webkit-backdrop-filter: var(--aurora-glass-blur);
}
.trigger:hover {
  background: var(--aurora-glass-fill);
}
```

after:

```css
.card:has(.trigger[aria-expanded='true']) {
  background: var(--surface-secondary);
  border: 1px solid var(--border);
}
.trigger:hover {
  background: var(--surface-secondary);
}
```

- [ ] **Step 2: Confirm the cluster is aurora-free**

Run: `grep -rn -- '--aurora' apps/frontend/src/modules/chat-ui-components`
Expected: no matches.

- [ ] **Step 3: Run the standard checks + browser verify**

Expected: thinking/compaction/todo/ask-user cards and the assistant marker + user bubble render as opaque token surfaces (secondary surface fill, hairline border), no blur, no bevel. Expanded disclosures still expand; hover still tints. Both themes.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/modules/chat-ui-components
git commit -m "refactor(frontend): flatten chat-ui-components glass cards onto HeroUI tokens"
```

---

### Task 7: Flatten glass surfaces — tool-ui, SubagentDisclosure, chat page

Same transform rule as Task 6, applied to the remaining glass consumers.

**Files:**

- `apps/frontend/src/modules/tool-ui/styles.module.css` — `.card:has(.trigger[aria-expanded='true'])` glass + `.trigger:hover`.
- `apps/frontend/src/modules/chat-stream/components/MessageList/components/SubagentDisclosure/styles.module.css` — `.wrapper` glass + blur.
- `apps/frontend/src/pages/chat/styles.module.css` — the block using `--aurora-active-fill` / `--aurora-glass-border` / `--aurora-glass-highlight` (active fill → `--accent-soft`, border → `--border`, highlight → delete).

- [ ] **Step 1: Apply the transform rule to each file above**

Use the Task 6 transform rule. For `pages/chat/styles.module.css`, the `--aurora-active-fill` occurrence maps to `var(--accent-soft)`.

- [ ] **Step 2: Confirm aurora-free**

Run: `grep -rn -- '--aurora' apps/frontend/src/modules/tool-ui apps/frontend/src/modules/chat-stream apps/frontend/src/pages/chat`
Expected: no matches.

- [ ] **Step 3: Run the standard checks + browser verify**

Expected: tool execution cards, subagent disclosure, and the chat page accent element are opaque token surfaces; no blur/bevel. Both themes.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/modules/tool-ui apps/frontend/src/modules/chat-stream apps/frontend/src/pages/chat
git commit -m "refactor(frontend): flatten tool-ui/subagent/chat-page glass onto HeroUI tokens"
```

---

### Task 8: Simplify nav + custom-component effects (delete glows/sheen)

The nav rail active state keeps a token-based look; the glows and the click sheen (no token) are deleted. StatusTimeline's node glow is deleted.

**Files:**

- `apps/frontend/src/pages/_layout/components/Sidebar/styles.module.css`
- `apps/frontend/src/pages/_layout/components/Sidebar/components/NavItemLink/styles.module.css`
- `apps/frontend/src/components/StatusTimeline/styles.module.css`

- [ ] **Step 1: Sidebar — token-based active state, delete sheen/glow**

In `Sidebar/styles.module.css`: `--aurora-active-fill` → `var(--accent-soft)`; `--aurora-active-bar` → `var(--accent)`; `--aurora-glass-fill`/`--aurora-glass-border`/`--aurora-glass-highlight` (glass pedestal / rail) → `var(--surface-secondary)` / `var(--border)` / delete; delete any rule using `--aurora-sheen` and `--aurora-active-bar-glow` (remove the sheen keyframe/animation and the glow declaration entirely).

- [ ] **Step 2: NavItemLink — delete the icon glow**

In `NavItemLink/styles.module.css`, remove the `filter: var(--aurora-active-icon-glow);` declaration from `.item[data-active='true'] .icon`. Keep `color: var(--accent);`. The `--font-ui` reference here still resolves (now defined in index.css).

- [ ] **Step 3: StatusTimeline — drop the node glow**

In `StatusTimeline/styles.module.css`, replace the `var(--aurora-active-bar-glow)` usage with a token (`var(--accent)` for the in-progress node color) or delete the glow declaration.

- [ ] **Step 4: Confirm aurora-free**

Run: `grep -rn -- '--aurora' apps/frontend/src/pages/_layout/components/Sidebar apps/frontend/src/components/StatusTimeline`
Expected: no matches.

- [ ] **Step 5: Run the standard checks + browser verify**

Expected: nav rail — resting muted, hover tint, active shows `--accent-soft` fill + `--accent` bar + accent icon (no glow, no sheen on click). StatusTimeline nodes render without glow. Both themes. The active-indicator travel (position animation) is unaffected.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/pages/_layout/components/Sidebar apps/frontend/src/components/StatusTimeline
git commit -m "refactor(frontend): nav + timeline via tokens, delete glows and sheen"
```

---

### Task 9: Delete `aurora-glass.css` and confirm zero aurora references

Now nothing consumes `--aurora-*`. Delete the file and its import.

**Files:**

- Delete: `apps/frontend/src/aurora-glass.css`
- Modify: `apps/frontend/src/index.css` (remove the `@import './aurora-glass.css';` line)

- [ ] **Step 1: Remove the import**

In `apps/frontend/src/index.css`, delete the line `@import './aurora-glass.css';`. The import block becomes:

```css
@import 'tailwindcss';
@import '@heroui/styles';
@import './heroui-overrides.css';
```

- [ ] **Step 2: Delete the file**

```bash
git rm apps/frontend/src/aurora-glass.css
```

- [ ] **Step 3: Prove there are no dangling references anywhere**

Run: `grep -rn -- '--aurora\|aurora-glass' apps/frontend/src`
Expected: **no matches at all.**

- [ ] **Step 4: Run the standard checks + full browser sweep**

Sweep every affected screen — layout frame, session list, workspace group, chat stream (assistant/user/thinking/compaction/todo/ask-user/tool/subagent cards), composer, settings nav, coding page — in **both** themes. Confirm nothing references a now-undefined variable (no transparent/broken surfaces).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/index.css
git commit -m "refactor(frontend): delete aurora-glass.css; styling now flows solely from HeroUI tokens"
```

---

### Task 10: Delete the design-language doc and fix its live reference

The "Aurora Glass" design language is retired. Delete the doc and update the one live file that instructs reading it (`apps/frontend/CLAUDE.md`). Historical plans/specs under `docs/superpowers/` are archival and left as-is.

**Files:**

- Delete: `apps/frontend/docs/design-language.md`
- Modify: `apps/frontend/CLAUDE.md`

- [ ] **Step 1: Delete the doc**

```bash
git rm apps/frontend/docs/design-language.md
```

- [ ] **Step 2: Replace the "Design Language" section in `apps/frontend/CLAUDE.md`**

Replace the current `## Design Language` section (which tells readers to read `docs/design-language.md` and lists Aurora rules) with:

```markdown
## Design Language

- Component styling flows from a **single source**: HeroUI's theme tokens.
  Global HeroUI token customization lives only in `src/heroui-overrides.css`.
  Do NOT redefine HeroUI tokens, reach into HeroUI internals (`:global(...)`),
  or paint bespoke material in component CSS Modules — consume HeroUI tokens
  (`var(--surface)`, `var(--border)`, `var(--accent-soft)`, …) instead.
- The app frame (`pages/_layout`) is the only component allowed to carry
  bespoke material (background gradient + Mica backdrop-blur), and it holds it
  as component-internal CSS, not as shared tokens.
- Motion stays event-driven, never ambient; honor `prefers-reduced-motion`.
- Light and dark are both first-class — verify every change in both.
```

- [ ] **Step 3: Confirm no live reference to the deleted doc remains**

Run: `grep -rn 'design-language' apps/frontend`
Expected: no matches (hits elsewhere under `docs/superpowers/` are archival records and out of scope).

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/docs apps/frontend/CLAUDE.md
git commit -m "docs(frontend): retire Aurora Glass design-language doc; document token-only rule"
```

---

## Self-Review

**Spec coverage:**

- "aurora-glass.css consumed only by heroui-overrides.css" → the file is deleted entirely (Tasks 1,3–9); zero consumers is the strongest form. ✅
- "heroui-overrides.css is the single token home, opaque aurora-toned surface/border" → Task 2. ✅
- "all components (HeroUI + hand-rolled) consume only HeroUI tokens" → Tasks 4–8. ✅
- "delete effects with no HeroUI token" (translucency, glass blur, highlight bevel, glows, sheen) → Tasks 2,5,6,7,8. ✅
- "keep gradient + Mica blur only for the main layout, as component-internal" → Task 3. ✅
- "delete the design doc" → Task 10. ✅

**Placeholder scan:** Color values in Task 2 and the canvas/mica values in Task 3 are concrete starting points with an explicit in-browser tuning instruction (CSS color work is tuned live per the repo's mandatory browser-verify workflow) — not TODOs. Task 3 Step 2 leaves the gradient string to be copied verbatim from the existing file rather than re-typed (transcription-error risk); the source is named exactly.

**Type consistency:** `isSelected: boolean` is introduced in `SessionListView.tsx` (render-prop) and threaded identically through `SessionItem` → `SessionItemView` (Task 4). No signature drift.

---

## Notes / follow-ups (not code tasks)

- Stale memories to fix after this lands: `omnicraft-aurora-glass-sidebar` (locked visual direction no longer holds), and the two `bun`-based memories (`omnicraft-dev-server-verification`, `omnicraft-frontend-test-command`) — the repo is now PNPM (`pnpm dev`, `pnpm --filter '@omnicraft/frontend' run test`).
- Exact opaque token values (Task 2) and any surface-level tuning should be finalized in-browser in both themes.
  </content>
  </invoke>
