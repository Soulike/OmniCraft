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

The top of the interface is the light source. The rail carries a soft accent
**aurora glow** from the top (dark theme). Shadows fall downward; top edges
catch a faint highlight. Keep this consistent everywhere — never light a
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

| Token                                             | Purpose                                                   |
| ------------------------------------------------- | --------------------------------------------------------- |
| `--aurora-glow-accent`, `--aurora-glow-violet`    | Top aurora bleed for rail backgrounds                     |
| `--aurora-glass-fill`                             | Translucent glass surface fill                            |
| `--aurora-glass-border`                           | Light-catching glass hairline                             |
| `--aurora-glass-highlight`                        | Inset top highlight on glass                              |
| `--aurora-active-fill`                            | Active nav item glass fill                                |
| `--aurora-active-bar`, `--aurora-active-bar-glow` | Active left-bar gradient + glow (glow is `none` in light) |
| `--aurora-inset-shadow`                           | Inner shadow for the recessed panel                       |

If a new surface needs a value that isn't here, **add it to
`aurora-glass.css` for both themes** (P4) rather than inlining it in a
component.

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

Three depth tiers — pick the one that matches the surface's role:

1. **Recessed (inset)** — the main content panel. Sits _into_ the frame:
   slightly darker than surroundings, inner shadow on top+left, the rail
   edge casts onto it. Reads as a screen set into a bezel.
2. **Flush glass** — the rail itself, glass pedestals, the active nav pill.
   Translucent fill (`--aurora-glass-fill`) + light-catching hairline
   (`--aurora-glass-border`) + top highlight (`--aurora-glass-highlight`).
3. **Raised** — transient overlays (popovers, tooltips, modals via HeroUI).
   Outer shadow, sits above everything. Use HeroUI's defaults, lightly
   tuned to match.

**Seam rule:** when two chrome surfaces meet (rail ↔ panel), dissolve the
boundary rather than drawing a hard line. The panel has **no border on the
shared edge**; a short gradient sliver in the rail's tone blends them so they
read as one continuous object. Free edges keep their rounded corners.

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
