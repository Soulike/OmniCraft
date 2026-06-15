# OmniCraft Design Language — "Aurora Glass"

> Audience: anyone (human or agent) building or restyling OmniCraft frontend
> UI. This is the **single source of truth** for the app's visual language.
> Read it before designing any new screen, component, or styling pass so the
> whole product stays coherent. The app frame (nav rail + main panel) is the
> canonical reference implementation of everything below.

---

## 1. Philosophy

OmniCraft should feel like a **premium native desktop application**, not a
web page. The aesthetic is **"Aurora Glass"**: calm, dark-leaning, glassy
surfaces lit by a single soft accent aurora, with restraint as the default
and delight reserved for the moments the user acts.

Three words to design against: **glassy, calm, intentional.**

What we are explicitly NOT: flat grey admin dashboards, generic Bootstrap/
Material defaults, busy gradients, neon, or anything that animates in the
user's peripheral vision while they read.

---

## 2. Core Principles

These are non-negotiable. When a decision is unclear, return to these.

### P1 — Material over flatness

Every meaningful surface has a _material_: a subtle gradient, a hairline
border that catches light, an inner or outer shadow that says where it sits
in space. Avoid pure flat fills. Depth is created with **light direction**,
not with heavy borders.

### P2 — One light source

The top of the interface is the light source. The shared page canvas
(`--aurora-canvas`) carries soft aurora colour blobs, leaning brighter toward
the top; the Mica panel blurs and tints from it. Shadows fall downward; top
edges catch a faint highlight. Keep this consistent everywhere — never light a
component from a contradictory direction.

### P3 — Motion is event-driven, never ambient

**The resting UI is fully static.** Motion exists _only_ as feedback to a
user action, plays **once**, and settles. Never loop an animation, never
animate something the user didn't trigger.

- ✅ A traveling active-indicator that slides when you navigate.
- ✅ A one-shot sheen/spring on click.
- ❌ Color-cycling logos, repeating shimmer, drifting auroras, breathing
  pulses, cursor-following spotlights.
- Always honor `prefers-reduced-motion` by snapping to the final state.
- Rationale: ambient motion is distracting and cheapens the product. This
  rule has already vetoed several "cool" ideas — respect it.

### P4 — Reinterpret per theme, don't port

Light and dark are **both first-class**, and each gets the treatment that
suits its substrate. The dark aurora glow looks dirty on white, so light
mode achieves the same _depth_ with soft shadows + pale frosted glass
instead of glow. Same accent, same structure, same radii — different
material recipe. Never bolt a dark-mode effect onto light unchanged.

### P5 — Accent is precious

The blue accent is the only saturated color in the chrome. Use it for the
_one_ thing that matters in a given context (the active state, the primary
action). If everything is accented, nothing is. Body text, borders, and
resting surfaces stay neutral.

### P6 — Reuse HeroUI, hand-roll only when it blocks the aesthetic

HeroUI (`@heroui/react`) + its theme variables are the foundation: use its
`Button`, `Tooltip`, `Spinner`, form controls, and theme tokens directly.
Only hand-roll a component when HeroUI's built-in styling actively fights
the Aurora Glass look (the nav rail items are the one current example —
`Tabs`' pill/indicator couldn't carry the glass active state). Hand-rolling
is a deliberate exception, not the default.

---

## 3. Color & Tokens

### 3.1 Base tokens (owned by HeroUI — do not redefine)

The base palette comes from HeroUI's theme and is the source of truth for
neutrals and the accent. Consume them via `var(--…)`; never hard-code or copy
their values into our code (HeroUI owns them and may change them).

| Token          | Use                                                                                          |
| -------------- | -------------------------------------------------------------------------------------------- |
| `--background` | App backdrop                                                                                 |
| `--foreground` | Primary text                                                                                 |
| `--surface`    | Raised surfaces                                                                              |
| `--border`     | Hairlines                                                                                    |
| `--accent`     | The one accent — shared by both themes; the through-line that keeps theme switching coherent |
| `--muted`      | Secondary text                                                                               |

To see the live values, inspect `:root` in the browser, or read HeroUI's
theme output (do not duplicate them here — that copy would rot).

### 3.2 Aurora Glass tokens (this design language adds these)

The glass / glow / depth recipe lives in **`src/aurora-glass.css`** (imported
from `src/index.css`), scoped to `:root.light` / `:root.dark`. That file is
the single source of truth for these values — **always consume them via
`var(--aurora-*)`; never paste the raw rgba/gradient values into a component.**

Available tokens (see the file for the actual recipe and both-theme values):

| Token                                                   | Purpose                                                                                              |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `--aurora-canvas`                                       | Page (layout) background: soft colour blobs over `--background`, sampleable by the panel's Mica blur |
| `--aurora-mica-fill`                                    | Translucent panel surface (Mica base)                                                                |
| `--aurora-mica-blur`                                    | Panel `backdrop-filter` value (blur + saturate)                                                      |
| `--aurora-mica-border`                                  | Panel hairline highlight border                                                                      |
| `--aurora-glass-fill`                                   | Translucent glass surface fill                                                                       |
| `--aurora-glass-border`                                 | Light-catching glass hairline                                                                        |
| `--aurora-glass-highlight`                              | Inset top highlight on glass                                                                         |
| `--aurora-glass-shadow`, `--aurora-glass-shadow-raised` | Outer drop shadow for raised glass (capsule); `-raised` is the stronger lift on focus. Per-theme.    |
| `--aurora-glass-blur`                                   | Backdrop blur for expandable glass cards (tool/thinking/subagent disclosures). Theme-independent.    |
| `--aurora-active-fill`                                  | Active nav item glass fill                                                                           |
| `--aurora-active-bar`, `--aurora-active-bar-glow`       | Active left-bar gradient + glow (glow is `none` in light)                                            |
| `--aurora-sheen`                                        | One-shot sheen sweep gradient on active nav item                                                     |
| `--aurora-active-icon-glow`                             | Active nav icon glow filter (dark only; `none` in light)                                             |

If a new surface needs a value that isn't here, **add it to
`aurora-glass.css` for both themes** (P4) rather than inlining it in a
component.

### 3.3 HeroUI token overrides (controlled)

Rather than restyle HeroUI components one-by-one, we override a small,
deliberate set of HeroUI's own semantic tokens in **`src/heroui-overrides.css`**
(imported after `@heroui/styles`, before `aurora-glass.css`) so the glass
material becomes the **default**. This is the preferred way to apply a
global material decision — override the token once, every consuming component
follows. Keep this set small and documented; do not let it sprawl.

Current overrides (both themes, reinterpreted per P4):

| HeroUI token                                 | Override                        | Why                                                                                                                                                                                                     |
| -------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--surface`                                  | translucent (alpha ~0.75)       | In-panel cards/panels pick up the Mica tint instead of reading as solid slabs. **No blur** — the panel behind is already frosted; pure alpha = zero perf cost. Tuned high enough to keep text readable. |
| `--surface-secondary` / `--surface-tertiary` | translucent, stepping alpha up  | Nested raised surfaces stay translucent too (HeroUI defines these as their own opaque values, not derived from `--surface`); deeper nesting reads slightly more solid.                                  |
| `--field-background`                         | translucent (alpha ~0.8)        | Inputs share the card material, but a touch more fill for text contrast. Independent of `--surface` via HeroUI's `--field-*` tokens.                                                                    |
| `--border`                                   | glass hairline (light-catching) | Aligns HeroUI's flat grey hairline to our blue-tinted glass edge globally.                                                                                                                              |

**Deliberately NOT overridden:**

- **`--overlay`** (menus, popovers, modals, tooltips) — stays opaque. A
  translucent overlay would let text behind bleed through, and the only fix
  (a backdrop blur on the overlay) requires targeting HeroUI's internal slot
  classes, which is fragile across upgrades. Floating layers stay solid.
- **`--field-foreground` / `--field-placeholder`** — text tokens stay on
  HeroUI defaults for contrast.

**Rules for this set:**

- Material decisions that should apply app-wide go here as a token override,
  **not** as a per-component `background`/`border` rule.
- Never override a token in a way that needs `backdrop-filter` on many
  elements or on overlays (perf + fragility). Translucency via alpha is free;
  blur is reserved for the frame Mica and a few transient expanded glass cards
  (`--aurora-glass-blur`).
- Keep light and dark in sync (P4).

---

## 4. Typography

| Role                       | Font                          | Notes                                                       |
| -------------------------- | ----------------------------- | ----------------------------------------------------------- |
| Display / brand / headings | **Bricolage Grotesque** (600) | Distinctive, characterful. The product's voice. Latin only. |
| UI / body / labels         | **Sora** (400–600)            | Clean, geometric, pairs with Bricolage. Latin only.         |
| Code / mono (where needed) | existing mono stack           | Tool output, IDs, etc.                                      |
| CJK / Chinese (all roles)  | **system fallback**           | See sourcing rule below — we do not self-host a CJK font.   |

### Sourcing & loading

- **Self-host the Latin fonts via Fontsource — never a CDN `<link>`.** This is
  a localized/desktop tool; Google Fonts CDN is unreliable in some regions and
  adds a third-party request. Install with the package manager (do not write
  versions by hand):
  - `@fontsource-variable/bricolage-grotesque`
  - `@fontsource-variable/sora`
  - Both are variable fonts (one file covers the weight range) and ship
    **Latin glyphs only**, which is exactly what we want.
- **Chinese falls back to the OS Chinese font.** Bricolage/Sora carry no CJK
  glyphs, and the UI is heavily Chinese. Rather than self-host a large CJK
  webfont, let Chinese characters fall back to the system stack. Put the Latin
  design font first and a CJK system stack after it, e.g.:

  ```css
  --font-display:
    'Bricolage Grotesque Variable', 'PingFang SC', 'Microsoft YaHei',
    'Noto Sans CJK SC', sans-serif;
  --font-ui:
    'Sora Variable', 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC',
    sans-serif;
  ```

  Result: Latin runs render in the design font; Chinese runs render in the
  user's native system font. Accept that mixed Latin+Chinese lines use two
  typefaces — this is the deliberate trade to keep the bundle small and avoid
  CDN dependence. (If a fully unified CJK design font is ever wanted, that's a
  separate decision — the only viable Fontsource option is the large
  `Noto Sans SC`, and it must be weight-subset, not shipped whole.)

- Define the two font stacks as tokens (alongside the Aurora tokens) so
  components reference `var(--font-display)` / `var(--font-ui)`, not raw names.

### Usage

- Never ship the generic `system-ui`/Inter/Arial look for primary chrome —
  it reads as "unstyled."
- Tighten display tracking slightly (`letter-spacing: -0.01em`) for polish.
- Keep body legible: don't tighten UI text below default.

---

## 5. Surfaces & Depth

The whole app sits on one **shared page canvas**, painted on the layout root
(`.layout`) via `--aurora-canvas`: the page `--background` with **many small,
varied, interleaved colour patches** (blue, violet, cyan, teal, periwinkle…).
The variety and hue contrast are the point — a few big soft blobs blur into a
flat gradient and lose the Mica feel, whereas many contrasting patches give
the panel's Mica blur a genuine **hazy colour drift**. Keep patch alphas low
so the canvas stays delicate and never competes with content. Every chrome
surface relates to this one canvas; that is what keeps the frame coherent and
seamless.

Surface roles:

1. **Transparent over the canvas** — the navigation rail. The rail has **no
   background of its own**; the canvas shows straight through it, so the rail
   and the gap around the panel are visually one continuous field.
2. **Mica panel** — the main content panel. A **translucent** surface
   (`--aurora-mica-fill`) with a heavy `backdrop-filter` (`--aurora-mica-blur`)
   that blurs the canvas behind it, picking up a faint tint — the Windows
   "Mica" material idea. Inset by a uniform small gap (so the canvas frames
   it), symmetric rounded corners, a faint light-catching border
   (`--aurora-mica-border`). **Mica is a frame-only material:** it applies to
   the panel container, NOT to the HeroUI content inside it.
3. **Translucent content surfaces** — everything rendered _inside_ the panel
   (HeroUI cards, inputs, etc.) sits on a **translucent `--surface` /
   `--field-background`** (set globally via the token overrides in §3.3), so
   in-panel content shares the glass material and picks up the panel tint
   **without** its own `backdrop-filter`. The translucency comes from alpha
   alone (free); we do **not** run blur on these surfaces. Text-bearing blocks
   that need maximum contrast (code/terminal/diff inside tool cards) stay on
   the opaque `--background`. Overlays stay opaque (§3.3).
4. **Flush glass accents** — glass pedestals, the active nav pill. Translucent
   fill (`--aurora-glass-fill`) + light-catching hairline
   (`--aurora-glass-border`) + top highlight (`--aurora-glass-highlight`),
   letting the canvas tint through.
5. **Raised** — transient overlays (popovers, tooltips, modals via HeroUI).
   Outer shadow, sits above everything. **Opaque** (`--overlay`), so text
   behind never bleeds through. Use HeroUI's defaults, lightly tuned.

**Frame rule:** one canvas (on the layout) with sampleable colour blobs. The
rail is transparent over it; the panel is a Mica material (translucent +
backdrop-blur) inset by a uniform gap so the same canvas surrounds and tints
it. No border lines define the frame — separation comes from the gap, the
blur, and a hairline highlight, never from a drawn edge. Panel corners are
symmetric. **Backdrop-blur stops at the frame:** in-panel surfaces gain glass
via translucency (alpha), not blur; overlays stay opaque.

---

## 6. Component Patterns

### 6.1 Navigation item (canonical hand-rolled glass component)

- Layout: icon (lucide, ~20px, stroke ~1.9) + label, ~46px tall, radius ~12px.
- **Resting:** `--muted` text, transparent fill, static.
- **Hover:** text lifts toward `--foreground`, faint translucent fill. No
  movement of the box (P3 forbids ambient bob; a color/`background`
  transition on hover is fine — it's event-driven and settles).
- **Active:** `--aurora-active-fill` + `--aurora-glass-highlight` + a left bar
  using `--aurora-active-bar` (with `--aurora-active-bar-glow` in dark). Icon
  picks up accent.
- **Active travels (P3):** the active pill+bar slides to the newly selected
  item on navigation, then rests. One-shot.
- **Click feedback (P3):** a single sheen sweep + small icon spring, once.

### 6.2 Glass pedestal (icon container)

- ~50px tile, radius ~13px, `--aurora-glass-fill` + `--aurora-glass-border` +
  `--aurora-glass-highlight`. Houses an icon/logo. **Static.** Used for the
  brand mark; reusable anywhere an icon deserves a material anchor.

### 6.3 Icon-only control (e.g. theme toggle)

- Prefer HeroUI `Button` (`isIconOnly`, `variant="ghost"`) + `Tooltip`.
- Restyle with the glass language only if it sits in a glassy context.

### 6.4 Brand assets

- The OmniCraft node-topology SVG is a **brand asset** — never redraw or
  recolor its geometry. Re-house it (e.g. in a glass pedestal), don't remake
  it. If a logo change is ever needed, that's a product decision, not a
  styling one — ask.

---

## 7. Motion Reference

| Trigger                | Effect                               | Duration      | Loops?    |
| ---------------------- | ------------------------------------ | ------------- | --------- |
| Navigate between pages | Active indicator slides to new item  | ~250ms spring | No        |
| Click a nav item       | One sheen sweep + icon spring        | ~300ms        | No        |
| Theme toggle           | (optional) one radial wash on switch | ~400ms        | No        |
| Hover interactive el   | color/fill transition                | ~150ms        | No        |
| **Anything at rest**   | **nothing**                          | —             | **Never** |

Every animation: `@media (prefers-reduced-motion: reduce)` → snap to final
state, no transition.

---

## 8. Do / Don't Cheat-Sheet

**Do**

- Reuse HeroUI components + theme tokens first.
- Give every surface a material (gradient/hairline/shadow).
- Keep light & dark equally polished, reinterpreted per substrate.
- Reserve accent + motion for what matters.
- Keep the resting screen perfectly still.

**Don't**

- Hard-code colors that exist as tokens.
- Add looping/ambient animation of any kind.
- Port a dark effect to light unchanged.
- Accent everything.
- Hand-roll a component HeroUI already does well.
- Redraw brand assets.

---

## 9. Provenance

This language was established during the 2026-06 frame redesign. The full
design rationale and the per-decision exploration live in:
`docs/superpowers/specs/2026-06-14-aurora-glass-frame-design.md` (repo root).
The app frame is the reference implementation — when in doubt, match it.
