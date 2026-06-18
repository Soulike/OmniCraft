# Assistant Message Marker Redesign — Design Spec

> Date: 2026-06-15
> Related issue: #285 (Redesign assistant message UI)
> Design language: Aurora Glass (`apps/frontend/docs/design-language.md` is the source of truth)

## 1. Background & Motivation

In the current chat stream, an assistant turn is **full-width body text** with a marker row above it: a 13px glass square dot (`.assistantDot`) + an uppercase grey "ASSISTANT" label (`.assistantLabel`), followed by a timestamp line.

The full-width layout itself is fine and should stay. The problem is that the **marker is too plain** — a small square plus a line of small grey text. Next to the user glass bubbles and the tool/thinking glass cards in the same stream, it lacks presence and a sense of craft (issue #285 calls it "unresolved").

This change redesigns only the assistant **marker**; the layout structure is untouched.

## 2. Design Direction

**Restrained refinement**: replace only the marker, keeping the "small marker + full-width body" structure. No turn container, no side rail, no change to the full-width layout. The "tech" feel comes from **material and form** (glass + the topology character of the real brand logo), not animation — per design-language P3 ("motion is event-driven, the resting state is fully static").

Explicitly **not** pursuing the more aggressive directions: wrapping the turn in a material container / a glowing left rail (too large a change; out of scope here).

## 3. Marker Composition

Replace the existing `.assistantDot` (13px glass square) + uppercase "ASSISTANT" label with:

### 3.1 Circular glass sigil

- Size **32px**, `border-radius: 50%`.
- Material reuses the existing Aurora Glass tokens, shared with the sidebar brand pedestal — only the shape changes from rounded square to circle:
  - `background: var(--aurora-glass-fill)`
  - `border: 1px solid var(--aurora-glass-border)`
  - `box-shadow: var(--aurora-glass-highlight)`
- The circle contrasts with the user bubble's rounded rectangle, reinforcing the "AI attribution mark" identity.

### 3.2 Logo inside the sigil

- Place the **real** OmniCraft node-topology logo, with its **geometry unchanged and not recolored** (design-language §6.4 brand-asset rule).
- Assets already exist: `apps/frontend/src/assets/icons/omnicraft-dark.svg` and `omnicraft-light.svg`.
- Logo render size ~20px (centered within the 32px sigil).
- **Theme-aware**: dark theme uses `omnicraft-dark.svg`, light theme uses `omnicraft-light.svg` — consistent with the existing `BRAND_ICONS[theme]` approach in the sidebar's `SidebarView`.

### 3.3 Wordmark

- Show the **OmniCraft** wordmark next to the sigil, using `var(--font-display)` (Bricolage Grotesque), replacing the previous uppercase grey "Assistant" text.

## 4. Preserved (unchanged)

- Assistant full-width body layout (`fullWidthMessage`).
- `MarkdownRenderer` for body rendering.
- `WorkingIndicator` empty state (when content is empty).
- Timestamp below the body (owned by `RenderItem`, shown when content is non-empty).
- The `fadeInUp` entry animation (already event-driven, compliant with P3).
- User bubble and tool/thinking cards.

## 5. Theme & Motion

- **Both themes are first-class** (P4): each uses its own SVG + its own glass token values; the dark effect is not ported onto light unchanged.
- **The sigil is fully static**: no glow pulse, no looping animation. Compliant with P3.
- No new motion is added.

## 6. Affected Files

- `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/MessageBubble/MessageBubbleView.tsx`
  - Assistant branch: render the circular sigil (theme-selected SVG) + OmniCraft wordmark, replacing `.assistantDot` + `.assistantLabel`.
  - Import the two SVGs (`?react`) and select by current theme — following the `BRAND_ICONS` pattern in `SidebarView.tsx`. Requires reading the theme (reuse the same theme source as the sidebar).
- `.../MessageBubble/styles.module.css`
  - Add the `.sigil` circular glass styles; remove `.assistantDot`; adjust/repurpose `.assistantLabel` into the marker row (icon + wordmark laid out horizontally).
- Tests: the existing `WorkingIndicatorView` / `RenderItem` tests do not depend on marker DOM details and are expected to be unaffected; confirm with `bun run test` after implementation.

## 7. Acceptance

- Start the app with `bun dev` (repo root) and view a real user→assistant turn in the browser for **both the dark and light themes**.
- Confirm:
  - The logo inside the 32px sigil is clearly legible (if it looks muddy, revisit the size — ship 32px first and observe).
  - The sigil + wordmark sit harmoniously next to the user bubble and tool/thinking cards.
  - The resting state has no animation at all.
- `bun run test` is fully green (use `bun run test`, not `bun test`).

## 8. Open Items

- Final sigil size: fixed at 32px to start; once wired into Chat and running, decide in the browser whether to fine-tune based on real legibility.
