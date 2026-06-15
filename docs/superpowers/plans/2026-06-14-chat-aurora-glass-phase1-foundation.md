# Chat Aurora Glass — Phase 1 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay the visual foundation for the Chat redesign — unify the design tokens used by chat components, strengthen the Mica panel recipe frame-wide, and turn the session-history sidebar into a transparent glass column that matches the nav-rail's active grammar.

**Architecture:** Pure CSS-module + token work, no behavioral/structural change. We tune shared values in `aurora-glass.css` (lifting the whole frame), then restyle three component stylesheets (`CollapsibleSidebar`, `SessionSidebar`, `SessionItem`) to consume Aurora tokens and the glass active-state. Because these are visual changes, verification is **browser-based in both themes** (the spec's stated method); existing Vitest tests must stay green but no new unit tests are added (there is no new logic).

**Tech Stack:** React 19 + Vite, CSS Modules, HeroUI v3 (`ListBox`, `ScrollShadow`, `Tooltip`, `Button`), HeroUI theme tokens + `--aurora-*` tokens, lucide-react. Package manager: Bun. Tests: Vitest. Lint: ESLint.

**Source spec:** `docs/superpowers/specs/2026-06-14-chat-aurora-glass-redesign-design.md` (decisions D1; Component sections 1 "Tokens" + 2 "SessionSidebar"). Phases 2–3 (message stream / tool cards / composer / welcome) are separate plans.

**Scope note:** `SessionSidebar` / `CollapsibleSidebar` are shared by both Chat and Coding pages — every change here lands on both, by design.

---

## File Structure

Files touched in this phase, each with one responsibility:

- `apps/frontend/src/aurora-glass.css` — **Modify.** Strengthen the Mica recipe (both themes). Add two session-row tokens if needed (hover wash, already-have active tokens). Single source of truth for glass values.
- `apps/frontend/src/components/CollapsibleSidebar/styles.module.css` — **Modify.** Drop opaque background + hard border so the column is transparent over the Mica. Keep collapse animation.
- `apps/frontend/src/modules/chat-session/components/SessionSidebar/styles.module.css` — **Modify.** Token standardization for list/centered/error/empty; the active-row glass treatment lives here (it styles the `ListBox.Item`).
- `apps/frontend/src/modules/chat-session/components/SessionSidebar/components/SessionItem/styles.module.css` — **Modify.** Token standardization for the row internals (icon/title/working-dir/popover); align the selected-icon accent.

No `.tsx` changes are expected in Phase 1 (structure/behavior unchanged). If a class rename forces a `.tsx` edit, that is called out in the task.

---

## Pre-flight

- [ ] **Step 0: Start the dev server and confirm baseline**

Run from repo root:

```bash
bun dev
```

Open the printed Vite URL (typically `http://localhost:5173`), navigate to **Chat**. Confirm the app loads and you can see the session sidebar (create a session if the list is empty). Use the theme toggle (top of the nav rail) to confirm you can switch light/dark — you will check both after each task. Leave this running in the background for the whole phase.

---

## Task 1: Strengthen the Mica panel recipe (both themes)

The current Mica reads slightly flat against the canvas (spec §Tokens "Stronger Mica panel"). Make the panel more translucent + more blurred + more saturated so the canvas colour-drift shows through. This is in `aurora-glass.css`, so it lifts the **whole frame** (every page), not just Chat.

**Files:**

- Modify: `apps/frontend/src/aurora-glass.css` (dark block ~line 142–144; light block ~line 77–79)

- [ ] **Step 1: Update the dark-theme Mica tokens**

In `apps/frontend/src/aurora-glass.css`, inside the `:root.dark {` block, replace the three Mica lines:

```css
--aurora-mica-fill: rgba(15, 16, 24, 0.7);
--aurora-mica-blur: blur(64px) saturate(1.4);
--aurora-mica-border: 1px solid rgba(255, 255, 255, 0.05);
```

with the stronger recipe:

```css
--aurora-mica-fill: rgba(18, 20, 30, 0.52);
--aurora-mica-blur: blur(72px) saturate(1.8);
--aurora-mica-border: 1px solid rgba(160, 180, 255, 0.16);
```

- [ ] **Step 2: Update the light-theme Mica tokens**

In the `:root.light {` block, replace:

```css
--aurora-mica-fill: rgba(255, 255, 255, 0.72);
--aurora-mica-blur: blur(64px) saturate(1.5);
--aurora-mica-border: 1px solid rgba(255, 255, 255, 0.6);
```

with (P4 — reinterpreted for light: stay bright + frosted, gain a touch more translucency/saturation without going dingy):

```css
--aurora-mica-fill: rgba(255, 255, 255, 0.6);
--aurora-mica-blur: blur(72px) saturate(1.7);
--aurora-mica-border: 1px solid rgba(255, 255, 255, 0.7);
```

- [ ] **Step 3: Verify in the browser, both themes**

With `bun dev` running, hard-refresh the Chat page.

- **Dark:** the main panel should show a faint hazy colour drift from the canvas behind it (not flat grey), with a slightly brighter hairline edge. Content inside stays readable.
- **Light:** switch theme — the panel stays bright/frosted (NOT dingy or grey), with soft depth. If light looks muddy, nudge `--aurora-mica-fill` alpha back up toward `0.66` and reduce saturate to `1.6`.
- Check another page (Dashboard/Settings) to confirm the frame-wide change looks right there too.

- [ ] **Step 4: Confirm tests + lint still pass**

```bash
cd apps/frontend && bun run test && bun run lint
```

Expected: PASS (no logic changed; this guards against accidental edits).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/aurora-glass.css
git commit -m "feat(frontend): strengthen Mica panel recipe for more glass depth"
```

---

## Task 2: Make the session sidebar transparent over the Mica

`CollapsibleSidebar` currently paints an opaque `--color-background` and a hard `border-right`, so the session list reads as a slab stacked next to the nav rail (spec D1). Remove both so the column floats transparently over the Mica panel; keep the collapse width/opacity animation untouched.

**Files:**

- Modify: `apps/frontend/src/components/CollapsibleSidebar/styles.module.css:1-23, 61-79`

- [ ] **Step 1: Remove the opaque background + hard border from `.sidebar`**

Replace the `.sidebar` rule (lines 1–11) — drop `background-color` and the `border-color` transition; keep layout + width transition:

```css
.sidebar {
  position: relative;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  height: 100%;
  transition: width 200ms ease;
}
```

Then in the open-state rule (lines 13–17), remove the `border-right`:

```css
.sidebar[data-open='true'] {
  width: 260px;
  overflow: hidden;
}
```

(The `data-open='false'` rule already has `border-right: none` — leave it, it is now redundant but harmless; or delete the `border-right: none` line for tidiness.)

- [ ] **Step 2: Align the header/title tokens to the Aurora set**

The header title currently uses `var(--color-muted)`. Standardize to the documented token. In `.title` (lines 69–79), change:

```css
color: var(--color-muted);
```

to:

```css
color: var(--muted);
```

(Leave the rest of `.title` as-is.)

- [ ] **Step 3: Verify in the browser, both themes**

Hard-refresh Chat.

- The session column should now sit **transparently over the Mica panel** — no opaque slab, no hard vertical divider between it and the chat area; the panel reads as one continuous surface.
- Collapse/expand via the header toggle still animates the width smoothly and the content fades.
- Switch theme — confirm the transparent column looks right in light too (text legible over the frosted panel).

- [ ] **Step 4: Confirm tests + lint**

```bash
cd apps/frontend && bun run test && bun run lint
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/CollapsibleSidebar/styles.module.css
git commit -m "feat(frontend): make session sidebar transparent over the Mica panel"
```

---

## Task 3: Give session rows the nav-rail glass active grammar

Restyle the session-list rows so resting/hover/active match the nav rail's language (spec §2): resting = muted + transparent, hover = faint glass wash, active = `--aurora-active-fill` + `--aurora-glass-highlight` + a glowing accent left bar (`--aurora-active-bar` / `-glow`). This replaces the current `--color-segment` + plain accent bar with the documented Aurora tokens, so history selection and nav selection feel like one system.

Reference for the exact active grammar: `apps/frontend/src/pages/_layout/components/Sidebar/styles.module.css:69-95` (the `.indicator` + `::before` bar).

**Files:**

- Modify: `apps/frontend/src/modules/chat-session/components/SessionSidebar/styles.module.css` (whole file)

- [ ] **Step 1: Restyle the list-item resting + hover + active states**

Replace the item rules (lines 10–38) so they use Aurora tokens and the glass active fill + glowing bar:

```css
.listBox :global(.list-box-item) {
  position: relative;
  border-radius: 10px;
  padding: 6px 10px;
  min-height: unset;
  font-size: 0.85rem;
  color: var(--muted);
  gap: 0;
  transition:
    color 150ms ease,
    background 150ms ease;
}

.listBox :global(.list-box-item):hover {
  color: var(--foreground);
  background: var(--aurora-glass-fill);
}

.listBox :global(.list-box-item[data-selected='true']) {
  color: var(--foreground);
  background: var(--aurora-active-fill);
  box-shadow: var(--aurora-glass-highlight);
  font-weight: 500;
}

.listBox :global(.list-box-item[data-selected='true'])::before {
  content: '';
  position: absolute;
  left: 0;
  top: 25%;
  height: 50%;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--aurora-active-bar);
  box-shadow: var(--aurora-active-bar-glow);
}
```

- [ ] **Step 2: Align the loading/error/empty tokens**

Replace the `.errorText` / `.emptyText` colors (lines 47–55) to use the documented tokens:

```css
.errorText {
  font-size: 0.8rem;
  color: var(--danger);
}

.emptyText {
  font-size: 0.8rem;
  color: var(--muted);
}
```

- [ ] **Step 3: Respect reduced motion**

Append to the end of the file:

```css
@media (prefers-reduced-motion: reduce) {
  .listBox :global(.list-box-item) {
    transition: none;
  }
}
```

- [ ] **Step 4: Verify in the browser, both themes**

Hard-refresh Chat with at least 2–3 sessions in the list.

- **Resting:** rows are muted, transparent, static.
- **Hover:** row text lifts toward foreground with a faint glass wash (no movement of the box).
- **Active/selected:** the current session has the glass accent fill + inset highlight + a glowing accent **left bar** — visually the same family as the active nav item in the rail. In **dark** the bar glows; in **light** it's a solid accent bar with no glow (driven by the tokens — verify both).
- Confirm the row delete button (hover to reveal) + its confirm popover still work and look right.

- [ ] **Step 5: Align the selected-row icon accent (SessionItem)**

Open `apps/frontend/src/modules/chat-session/components/SessionSidebar/components/SessionItem/styles.module.css`. It already uses `--color-muted` (line 12) and `--color-accent` (line 17) for the icon. Standardize to the documented tokens:

- Line 12 `color: var(--color-muted);` → `color: var(--muted);`
- Line 17 `color: var(--color-accent);` → `color: var(--accent);`

Also standardize the title/working-dir/popover colors in that file from `--color-muted` → `--muted` (lines ~49, plus `.workingDirectory` and `.popoverBody`). Leave structure and the `[data-selected='true']` selector untouched.

- [ ] **Step 6: Verify the icon + tokens in the browser**

Hard-refresh. The selected session's leading icon should be accent-colored and match the bar; resting icons muted. Both themes.

- [ ] **Step 7: Confirm tests + lint**

```bash
cd apps/frontend && bun run test && bun run lint
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/modules/chat-session/components/SessionSidebar/styles.module.css apps/frontend/src/modules/chat-session/components/SessionSidebar/components/SessionItem/styles.module.css
git commit -m "feat(frontend): apply nav-rail glass active grammar to session rows"
```

---

## Task 4: Cross-page + full-phase verification

The sidebar is shared with Coding, so confirm the change there too, and do a final both-themes pass.

- [ ] **Step 1: Verify Coding page**

Navigate to **Coding**. Confirm the session sidebar there shows the same transparent glass column + glass active rows (it composes the same `SessionSidebar`). No regressions in the Coding layout.

- [ ] **Step 2: Both-theme sweep**

For **Chat** and **Coding**, in **light** and **dark** (4 combinations):

- Panel shows Mica colour-drift (Task 1).
- Sidebar is transparent over the panel, no slab/divider (Task 2).
- Rows: resting muted, hover wash, active glass fill + accent bar; glow in dark, no glow in light (Task 3).
- Collapse toggle still works; reduced-motion (if you can toggle OS setting) snaps transitions.

- [ ] **Step 3: Final tests + lint + build**

```bash
cd apps/frontend && bun run test && bun run lint && bun run build
```

Expected: all PASS / build succeeds.

- [ ] **Step 4: No commit needed** (verification only). If any fix was required, commit it with a `fix(frontend):` message describing the adjustment.

---

## Self-Review (completed by plan author)

**Spec coverage (Phase-1 portion):**

- Tokens §"Stronger Mica panel" → Task 1. ✓
- Tokens §standardize on documented Aurora set → Tasks 2/3 (each style file's `--color-*` → documented tokens). ✓
- D1 / §2 transparent glass column → Task 2. ✓
- §2 row resting/hover/active glass grammar + nav-rail parity → Task 3. ✓
- §2 selected-icon accent + loading/error/empty tokens → Task 3 steps 2/5. ✓
- Shared-by-Coding scope → Task 4 step 1. ✓
- Both-themes-first-class (P4) → Task 1 steps 1–2 (both blocks) + every verify step. ✓
- Motion event-driven only / reduced-motion → Task 3 step 3. ✓
- Out of Phase 1 (correctly deferred): message stream, tool cards, composer, welcome — Phases 2–3.

**Placeholder scan:** No TBD/TODO; every CSS change shows the exact replacement block. ✓

**Token/selector consistency:** Active selector `[data-selected='true']` matches HeroUI `ListBox.Item`'s existing attribute used in the current file; `--aurora-active-fill` / `--aurora-active-bar` / `--aurora-active-bar-glow` / `--aurora-glass-fill` / `--aurora-glass-highlight` all exist in `aurora-glass.css` (verified). No new token is actually required (hover uses existing `--aurora-glass-fill`), so no addition to `aurora-glass.css` beyond the Mica tuning. ✓

**Note on testing:** This phase adds no logic, so per the spec it is verified in-browser; existing Vitest suite is run as a regression guard each task. This is an intentional, spec-aligned deviation from the template's per-task unit-test default.
