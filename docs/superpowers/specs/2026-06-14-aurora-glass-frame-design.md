# Aurora Glass Frame — Visual Redesign

**Date:** 2026-06-14
**Status:** Approved (design); supersedes the visual layer of
`2026-06-14-desktop-app-shell-redesign-design.md` (which defined the
structural skeleton — that structure stands; this redoes its look & feel).

## Goal

Elevate the desktop-app frame from the current flat/grey HeroUI-`Tabs`
look (judged "cheap, timid") into a distinctive **Aurora Glass** aesthetic:
glassy materials, an accent aurora glow, an inset main panel seamed into
the rail, and restrained event-driven motion. Must feel like a premium
native desktop app, in both light and dark themes.

## Scope

This redesign covers **only the frame** (the shell chrome): the left
navigation rail, the main-panel shell, the seam between them, and the
frame-level depth/motion. It does **not** touch page content rendered
inside the panel (the user will redesign page interiors separately).

## Design Decisions (all locked via visual brainstorming)

### 1. Aesthetic direction — "Aurora Glass"

- Dark theme: deep indigo base (`#08–0d` range) with a soft accent
  **aurora glow** bleeding from the top of the rail; subtle noise texture
  for material richness.
- Light theme: **reinterpreted, not ported.** Glow would read as "dirty"
  on white, so light mode achieves depth via **soft shadows + pale-blue
  frosted glass** instead of glow. White → cool-white gradient base, very
  faint top aurora tint.
- Shared across both themes: same blue accent (the real HeroUI token
  `oklch(0.62 0.195 253.83)`), same display font, same radii, same
  structure — so switching themes feels coherent.

### 2. Typography

- Brand wordmark + (optionally) nav labels use **Bricolage Grotesque**
  (display, weight 600). Distinctive, characterful — replaces the generic
  `system-ui`. Body/label fallback: **Sora**. Fonts loaded via the app
  (self-hosted or Google Fonts link); confirm licensing/loading approach
  at implementation.

### 3. Brand logo — glass pedestal (static)

- Keep the **existing** OmniCraft node-topology SVG (do NOT redraw it).
- Wrap it in a **glass pedestal** tile (~50px, rounded ~13px):
  - Dark: translucent white glass, accent-tinted hairline border, soft
    accent shadow.
  - Light: white frosted glass, soft cool shadow, inner top highlight.
- **Fully static.** No color-cycling, no shimmer. (Per the user's
  animation-restraint rule — see [[animation-restraint-event-driven]].)

### 4. Navigation items (the core upgrade)

- Built as a **hand-rolled component**, NOT HeroUI `Tabs`. Rationale:
  `Tabs`' built-in pill background + indicator fight the glass/glow active
  state and the traveling indicator; the rail is navigation (router Links),
  not content-panel switching. Keep using HeroUI `Tooltip`/`Button` where
  they fit (e.g. theme toggle), and the existing route→active-id logic.
- Each item: icon (lucide, ~20px, stroke ~1.9) + label, ~46px tall,
  radius ~12px.
- **Active state:** glassy accent-gradient fill + inset top highlight +
  a glowing accent **left bar**; in dark mode the icon picks up an accent
  glow. Light mode: pale-blue glass fill + solid accent left bar + soft
  lift shadow (no glow).
- **Hover state:** subtle raise in text color + faint translucent fill.
- **Resting state:** muted foreground, fully static.

### 5. Frame depth — INSET (recessed panel)

- The main panel is **recessed into** the rail's plane (not a floating
  card). Light source logic is inverted vs. a floating card:
  - Panel sits flush (no outer margin/gap on its inset edges), rendered
    **slightly darker** than its surroundings.
  - **Inner shadow** on the panel's top + left inner edges; the rail edge
    casts a soft shadow onto the panel — like a screen set into a device
    bezel. The rail reads as the "frame/chassis," content as the inset
    display. This matches the original "功能页面被套在导航区中" intent.

### 6. Seam — left edge dissolves into the rail

- The panel has **no left border**; its left edge dissolves into the rail
  via a short gradient sliver matching the rail tone, so rail + panel read
  as one continuous object ("边框和左栏融为一体"). The panel keeps rounded
  corners only on its free (right) side.

### 7. Motion — event-driven only, never ambient

Per [[animation-restraint-event-driven]]: the resting UI is fully static.
The only motions, both one-shot and triggered by the user's own action:

- **Traveling active indicator ★** — when navigating between pages, the
  active pill + glowing left bar **springs/slides** to the new item's
  position, then rests. (Not an instant jump; not a loop.)
- **One-shot select feedback** — on click of a nav item, a single sheen
  sweeps across it once and the icon does a small spring, then settles.
- All motion respects `prefers-reduced-motion` (snaps to final state).
- **Rejected** (too distracting / ambient): logo color-cycle, repeating
  shimmer, drifting aurora, cursor spotlight, hover-bob, and a top-edge
  accent rim-light (tried, judged gilding-the-lily).

## What this changes in code (high level)

- `Sidebar/` — replace the HeroUI `Tabs` nav with a hand-rolled nav list
  (router `Link` per item) carrying the Aurora Glass styling, traveling
  indicator, and one-shot select feedback. Brand row gets the glass
  pedestal. Keep the existing connector logic (route→active id, theme).
- `_layout/styles.module.css` — rework the shell for the **inset** panel
  (inner shadows, seam dissolve, no left border) instead of the current
  floating rounded card; add the rail's aurora-glow + noise background.
- `ThemeToggle/` — unchanged behavior (single cycling icon); restyle to
  match the glass language if needed.
- Add theme-specific tokens/values for the Aurora Glass surfaces, layered
  on top of the existing HeroUI variables (which remain the source of
  truth for the base accent/foreground/background).
- Fonts: introduce Bricolage Grotesque (+ Sora) loading.

## Constraints

- Reuse HeroUI infrastructure where it fits (Tooltip, Button, theme
  variables, the theme context/`useTheme`). Only hand-roll where HeroUI's
  component styling blocks the target aesthetic (the nav items).
- CSS Modules only; no Tailwind utility classes in our components.
- MVVM structure preserved; views stay stateless.
- Both light and dark themes must be first-class (not an afterthought).
- No `any`; follow the project's TS and file-naming conventions.

## Verification

- Manual browser review in **both** themes across Dashboard/Chat/Coding/
  Settings: rail materials, glass pedestal, active/hover nav states,
  inset panel depth, seam dissolve on the left edge.
- Traveling indicator animates on navigation and snaps under
  `prefers-reduced-motion`; one-shot select feedback fires once and rests.
- Resting UI is fully static (no looping animation anywhere).
- Existing tests still pass; build + lint clean.
