# AskUserCard — Submission-State Notices (#307)

> Design spec. Gives the AskUserCard two missing degraded states a
> dignified, on-brand presentation: when a session cannot accept answers,
> and when a submission fails to reach the backend.

---

## 1. Problem

`AskUserCard` (the in-stream `ask_user` questionnaire) has two degraded
states that are currently handled poorly or not at all:

1. **Session cannot accept answers** (`onSubmit === null`). The card still
   renders the full questionnaire (all controls disabled) and shows a bare
   line of muted text: _"This session does not support form submission."_
   It reads as an unfinished placeholder (literally tagged
   `TODO(#307)` in `AskUserCardView.tsx`).

2. **Submission fails** (the `onSubmit` promise rejects — network/delivery
   failure). Today there is **no feedback at all**: `useSubmitActions`
   catches the rejection, resets `submitting` to `false`, and the card
   silently returns to the editable state. The user's answers are preserved
   but they get no signal that anything went wrong. Also tagged
   `TODO(#307)` in `useSubmitActions.ts`.

Both gaps were deferred as `TODO(#307)`. This spec closes them.

These two states are **semantically different**, and that difference must
be honored in the design:

- _Unsupported_ is a **permanent, resting** condition — the session simply
  has no submission channel. The notice is a quiet, static explanation.
- _Submit failure_ is a **transient event** — it was triggered by the user
  pressing Submit, the answers are still there, and retry is just pressing
  Submit again. The notice should be noticed, then settle.

---

## 2. Scope

In scope:

- A persistent, dignified notice for the unsupported state.
- A transient error notice for the submit-failure state, with retry via the
  existing Submit button.
- The `useSubmitActions` change needed to expose a submit-failure flag and
  log the underlying error.

Out of scope:

- The `done` / `failure` / `error` result states (`CompletedCard` /
  `CancelledCard`) — those are backend-delivered tool outcomes via SSE, a
  different concern from a failed submit **request**, and already styled.
- Any change to how answers are collected or validated.
- The temporary `/preview` route (kept locally for visual checks, not part
  of this feature).

---

## 3. Design

### 3.1 Two components, not one

The two notices share only a trivial shape — one flex row of
`icon + sentence`. Their **behavior** diverges:

|                 | Unsupported         | Submit failure             |
| --------------- | ------------------- | -------------------------- |
| Lifetime        | Permanent (resting) | Transient (event)          |
| Tone            | `muted` / info      | `danger`                   |
| Icon (lucide)   | `Info`              | `TriangleAlert`            |
| Tint block      | none                | faint `danger` tint, inset |
| Entry animation | none (static)       | one-shot fade-in           |

Because the behavior genuinely diverges — and that divergence is _correct_
per the design language (P3: never animate something the user didn't
trigger; P5: reserve emphasis) — collapsing them into one component with a
`tone` union would force `tone === 'danger' && …` branches throughout. We
instead write **two small sibling components**, each with one clear
behavior and no internal branching. The shared three-line JSX shape is not
worth a shared primitive (YAGNI; three similar lines beat a premature
abstraction).

```
AskUserCard/components/
  UnsupportedNotice/   # permanent, static, muted, Info icon, no tint
  SubmitErrorNotice/   # transient, fade-in, danger, TriangleAlert, faint tint
```

Each follows the project's MVVM file convention (`index.ts` +
`<Name>.tsx` + `styles.module.css`; no hook needed — both are stateless
presentational views driven by props from the parent).

### 3.2 Placement

Both notices render in the same slot: **between `.body` and `.footer`** of
the questionnaire card (i.e. just above the Cancel/Submit row). The two are
mutually exclusive — an unsupported session never triggers a submit, so
they can never appear together. Reusing one slot keeps the layout simple.

The unsupported notice **replaces** the current bare `disabledNotice`
paragraph. The questionnaire itself is still rendered (disabled), so the
user can see what was asked — only the bottom line is upgraded.

### 3.3 `UnsupportedNotice`

- Layout: `Info` (16px) + sentence, `gap: 8px`, left-aligned, natural
  width. `padding: 10px 16px` (aligns horizontally with the footer).
- Color: icon and text both `var(--muted)`. No tint block, no animation —
  it is a resting explanation and should be as quiet as possible.
- Copy: **"This session can't accept answers."**

### 3.4 `SubmitErrorNotice`

- Layout: `TriangleAlert` (16px) + sentence, `gap: 8px`.
- Color: icon and text `var(--danger)`.
- Tint: a faint danger block to pull it out as an event needing attention —
  `background: color-mix(in oklch, var(--danger) 6%, transparent)`,
  `border-radius: 8px`, inset from the card edges
  (`margin: 4px 16px; padding: 10px 12px`). Verified legible and
  un-muddy in both light and dark (mock review).
- Animation (P3 — event-driven, one-shot, settles): a ~150ms fade-in
  (`opacity` + small `translateY`) when it appears. Under
  `@media (prefers-reduced-motion: reduce)`, snap straight to the final
  state (no transition).
- Copy: **"Couldn't reach the server. Try again."**

### 3.5 State flow (`useSubmitActions`)

Extend `SubmitActions` with a `submitError: boolean`. The handler:

```
handleSubmit:
  if (submitting || onSubmit === null) return
  setSubmitting(true)
  setSubmitError(false)            # clear stale error before retrying
  onSubmit(callId, {cancelled: false, answers: collectAnswers()})
    .catch((err) => {
      console.error('ask_user submit failed', err)   # detail → console only
      setSubmitting(false)
      setSubmitError(true)         # UI flips this boolean; copy is fixed
    })
```

`handleCancel` gets the same treatment (a cancel can also fail to deliver).

Key points:

- The UI shows **fixed friendly copy**; it never surfaces `err.message`
  (often an unhelpful `Failed to fetch`). The raw error goes to
  `console.error` for debugging.
- **Retry is just Submit again.** Pressing Submit clears `submitError`
  first, then re-sends. No separate Retry button.
- `submitError` lives in `useSubmitActions` alongside `submitting`.

### 3.6 View wiring (`AskUserCardView`)

In the running-state render path (the `done` / `failure` branches are
untouched), choose the notice slot content:

| Condition                   | Rendered in the slot    |
| --------------------------- | ----------------------- |
| `!submitActions.canSubmit`  | `<UnsupportedNotice />` |
| `submitActions.submitError` | `<SubmitErrorNotice />` |
| otherwise                   | nothing                 |

`canSubmit` and `submitError` are mutually exclusive in practice (no
submit channel ⇒ no submit ⇒ no submit error), so a simple precedence
(`canSubmit` first) is sufficient; no combined state to handle.

The existing `disabledNotice` styles and the `{!canSubmit && <p>…}` block
in `AskUserCardView.tsx` are removed (superseded by `UnsupportedNotice`).

---

## 4. Copy

Copy is **English**, matching the rest of the card ("Questions from
Assistant", "Cancel", "Submit", "Questions Answered"). Mixing a single
Chinese line into an otherwise-English card would read as inconsistent.
Decided with the user: English.

- Unsupported: **"This session can't accept answers."**
- Submit/cancel failure: **"Couldn't reach the server. Try again."**

The failure copy is deliberately **action-neutral**: the same notice fires
for a failed submit _and_ a failed cancel (both go through the same
rejecting handler), so wording like "Couldn't send your answer" would be
inaccurate on the cancel path. "Couldn't reach the server" reads correctly
for either, which is why one notice covers both rather than splitting into
submit-/cancel-specific variants.

---

## 5. Files touched

New:

- `AskUserCard/components/UnsupportedNotice/{index.ts,UnsupportedNotice.tsx,styles.module.css}`
- `AskUserCard/components/SubmitErrorNotice/{index.ts,SubmitErrorNotice.tsx,styles.module.css}`

Modified:

- `AskUserCard/hooks/useSubmitActions.ts` — add `submitError` state, clear
  on retry, `console.error` the raw error.
- `AskUserCard/AskUserCardView.tsx` — render the notice slot; drop the old
  `disabledNotice` paragraph and the `TODO(#307)` comment.
- `AskUserCard/styles.module.css` — remove the now-unused `.disabledNotice`
  rule.

No changes to `AskUserCard.tsx` (container) are expected beyond passing the
already-available `submitActions` through (it already does).

---

## 6. Testing / verification

- Type-check (`tsc -b`) and lint clean.
- Visual verification in the browser via the temporary `/preview` route, in
  **both** light and dark themes (per the frontend UI-validation rule):
  - unsupported state — quiet muted notice, questionnaire still visible
    but disabled;
  - submit-failure state — danger notice with faint tint appears (fade-in),
    answers preserved, pressing Submit clears it and re-sends;
  - `prefers-reduced-motion` — failure notice appears without transition.
- Confirm the raw rejection reaches `console.error` and is **not** shown in
  the UI.

---

## 7. Design-language compliance

- **P3 (motion is event-driven):** only the failure notice animates, once,
  on a user-triggered event, and honors `prefers-reduced-motion`. The
  unsupported notice is fully static.
- **P5 (accent/emphasis is precious):** danger color + tint reserved for
  the one state that needs attention; the resting unsupported notice stays
  neutral `muted`.
- **Tokens:** uses `var(--muted)` / `var(--danger)` and `color-mix` on
  `--danger`; no hard-coded colors.
- **Reuse vs hand-roll (P6):** these are tiny in-card text rows, not
  something HeroUI provides at the right weight (its `Alert` is a
  banner-scale Title+Description, and lives in the `chat-session` module —
  cross-module reuse is disallowed by project convention). Hand-rolling two
  three-line views is the lighter, on-convention choice.
