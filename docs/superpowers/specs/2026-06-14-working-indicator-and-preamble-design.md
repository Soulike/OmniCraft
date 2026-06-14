# Working Indicator + Pre-Action Preamble

## Problem

While the agent works between SSE events, the frontend shows an empty
assistant bubble. Concretely, `useMessages` inserts an empty-`text`
placeholder message in three spots — after the user message, after each
tool finishes, and after thinking ends — and `MessageBubbleView` renders a
bare HeroUI `<Skeleton>` whenever an assistant bubble's content is empty.

Two problems with this:

1. The skeleton placeholder looks bland and gives no sense of life.
2. The model tends to work silently — it calls tools and runs multi-step
   work without telling the user what it is doing or about to do, so the
   user cannot follow along.

GitHub issue: <https://github.com/Soulike/OmniCraft/issues/270>.

## Goals

- Replace the empty assistant placeholder with a distinctive animated
  "working" indicator: a green pulsing dot + a status word with a
  shimmer-sweep animation, cycling through generic gerunds
  (Thinking…, Pondering…, Brewing…, Cooking…, etc.).
- Instruct every agent to state, in one sentence, what it is about to do
  and why before taking any action — not limited to tool calls.
- Keep both changes small and reuse existing infrastructure: HeroUI theme
  tokens, the shared system-prompt mechanism.

## Non-Goals

- Do not add any new SSE event or backend protocol change for the
  indicator. It is derived entirely from existing frontend state (an empty
  assistant bubble == waiting).
- Do not make the indicator describe the _specific_ current action
  (e.g. "Reading foo.ts"). The status words are generic and decorative;
  concrete "what it's doing" comes from the model's preamble text and from
  existing tool-execution cards.
- Do not build a HeroUI component for the pulsing dot — HeroUI's `Spinner`
  is a rotating ring only, with no pulse variant. The dot is plain CSS.
- Do not change the per-agent prompt bodies beyond adding the shared
  preamble instruction.

## Design

### Part 1 — Working indicator (frontend)

#### Where it renders

The empty placeholder is an `assistant-text` render item whose `content` is
`''`. Today `MessageBubbleView` renders `<Skeleton>` for any empty bubble.
We replace that empty-state branch with a new `WorkingIndicator` component,
but only for the **assistant** role. User bubbles always carry content, so
the empty branch should never apply to them; we gate on
`role === 'assistant'` to be explicit and avoid ever showing a "working"
animation under a user message.

```tsx
// MessageBubbleView, empty branch
content ? (
  <MarkdownRenderer content={content} />
) : role === 'assistant' ? (
  <WorkingIndicator />
) : (
  <Skeleton className={styles.skeleton} /> // unchanged fallback
);
```

Because the indicator lives in the empty-content branch, it disappears
automatically the moment the first `text-delta` arrives (content becomes
non-empty → Markdown renders). This matches the desired behavior: once a
real event arrives, the placeholder is gone.

#### Component

New component under the chat-session message components, following the
project's MVVM + CSS-Modules conventions:

```
WorkingIndicator/
  index.ts
  WorkingIndicator.tsx        // picks a random word on mount, holds it
  WorkingIndicatorView.tsx    // stateless: dot + animated word
  styles.module.css
```

- **Dot**: a 9px circle using `--success` (green), with an expanding
  `::after` ring (`scale` + fade) on a ~1.5s `ease-out` infinite loop.
- **Word**: shimmer-sweep — a left-to-right moving highlight via a
  `linear-gradient` background clipped to the text
  (`background-clip: text`), animating `background-position`. Base color
  `--muted`, highlight `--foreground`.
- **Word choice**: the container picks one gerund at random on mount from a
  small in-file list (Thinking…, Pondering…, Brewing…, Cooking…, Crafting…,
  Conjuring…, Noodling…, etc.) and keeps it stable for the life of that
  placeholder. No timer-based cycling — each new placeholder instance gets a
  fresh random word, which already produces variety across turns.

All colors come from existing theme tokens (`--success`, `--muted`,
`--foreground`, `--surface`, `--border`), so light/dark mode work for free.

#### Layout note

Per the frontend layout rule, `WorkingIndicator` must not set its own outer
margins/placement. It renders the dot+word inline; the surrounding bubble
already controls placement.

### Part 2 — Pre-action preamble (backend)

#### Shared instruction

Add a new shared constant alongside `mathRenderingInstructions`, following
the exact same mechanism:

- New file `apps/backend/src/agent/system-prompts/preamble.ts` exporting
  `preambleInstructions`.
- Re-export it from `apps/backend/src/agent/system-prompts/index.ts`.

Content (English, natural imperative, matching existing prompt voice):

> Before taking any action, state in one sentence what you're about to do
> and why. "Action" here is not limited to tool calls — before starting a
> stretch of multi-step work, moving into a new phase, or tackling a
> sub-problem, briefly say what you intend to do. Keep it short; one
> sentence is usually enough. The goal is to keep the user aware of what
> you're doing and about to do, rather than working silently for a long
> time.

#### Applied to all agents

All four agents include the constant in their prompt array, the same way
they already include `mathRenderingInstructions`:

- `main-agent/system-prompt.ts`
- `coding-agent/system-prompt.ts`
- `explore-sub-agent/system-prompt.ts`
- `general-sub-agent.ts` (inlines its prompt in the agent file)

The preamble text from the main/coding/general agents reaches the user as
normal `text-delta` output and naturally fills the pre-tool gap. For the
explore sub-agent it shapes its report-building narration; even though its
output is mediated, the instruction keeps its behavior consistent with the
others. (Scope decision: user chose "all agents share it".)

## Testing

- **Backend**: the existing `system-prompt.test.ts` files assert prompt
  composition. Update/extend them so each agent's prompt includes the
  preamble text. Keep assertions loose (substring match) to avoid brittle
  coupling to exact wording.
- **Frontend**: a small render test for `WorkingIndicator` (renders a word
  from the list + the dot). Optionally assert `MessageBubbleView` renders
  `WorkingIndicator` for an empty assistant bubble and not for a user one.
- **Manual**: run the dev server, send a message, and confirm: (1) the
  green pulsing dot + shimmering word appears in place of the old skeleton
  while waiting, (2) it vanishes when streaming text begins, (3) the model
  now opens with a one-sentence statement of intent before acting.

## Files Touched

Frontend:

- `.../MessageBubble/MessageBubbleView.tsx` — swap empty assistant branch.
- `.../WorkingIndicator/*` — new component (4 files).

Backend:

- `src/agent/system-prompts/preamble.ts` — new shared constant.
- `src/agent/system-prompts/index.ts` — re-export.
- `main-agent/system-prompt.ts`, `coding-agent/system-prompt.ts`,
  `explore-sub-agent/system-prompt.ts`, `general-sub-agent.ts` — include it.
- Corresponding `*.test.ts` updates.
