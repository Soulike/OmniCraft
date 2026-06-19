# Stop-Check Reminders

A mechanism that lets the agent loop run extensible checks at the moment a turn
would end, and inject a hidden reminder back to the LLM when a check is not
satisfied — for example, "you still have unchecked TODOs". The reminder is
visible to the LLM and persisted for debugging, but never rendered in the UI.

## Problem

The agent turn loop in `agent-turn-runner.ts` ends a turn solely by checking
`while (toolCalls.length > 0)` (`agent-turn-runner.ts:111`). When the LLM stops
calling tools, the loop exits unconditionally and `emitDoneAfterTurn` runs. There
is no hook to inspect agent state and nudge the model before the turn closes.

We want to catch cases where the agent stops prematurely while work is still
pending. The first such case is incomplete TODOs: the agent has a TODO list with
items still in `pending`/`in_progress`, but it stops calling tools and would end
the turn. The system should remind it before letting the turn finish.

The reminder must be:

- **Visible to the LLM** so it can act on it (complete the work, or explicitly
  state why it is stopping).
- **Hidden from the UI** in both live streaming and history reload, so the chat
  transcript is not polluted with system bookkeeping.
- **Visible for debugging** so we can see the full causal chain of why a turn ran
  extra rounds.

## Goals

- Add an extensible `StopCheck` registry evaluated at the turn-end boundary.
- Inject a reminder as a hidden `user` message to the LLM when one or more checks
  are unsatisfied, wrapped in `<system-reminder>`.
- Emit a dedicated `stop-check-reminder` SSE event that is persisted and replayed
  but ignored by the frontend in both live and reload paths.
- Ship an `incomplete-todos` check as the first `StopCheck`.
- Guarantee termination via the existing `maxRounds` ceiling.

## Non-Goals

- No `LlmMessage` schema change. History reload is purely SSE-event-driven (see
  Background), so marking the injected message would have no consumer.
- No stateful "fired once" tracking. Checks are re-evaluated every turn-end
  boundary; an unsatisfied check keeps reminding until satisfied or `maxRounds` is
  reached.
- No separate round budget for reminder rounds. Reminder rounds and tool rounds
  share one `round` counter and one `maxRounds` ceiling.
- No dev-mode rendering of the reminder event. The event is persisted; a debug UI
  can be added later if needed.
- No change to compaction, abort, usage reporting, or persistence beyond adding
  the new event to the existing SSE log.

## Background: how history reload works

History reload is **SSE-event replay only**. On reconnect, the backend streams
persisted events from `sse-events.jsonl` via the `GET .../session/:id/events`
endpoint (`dispatcher/agent-session/router.ts`); it never sends `LlmMessage[]` or
the `LlmSession` snapshot to the frontend. The frontend rebuilds every chat bubble
from SSE events — a user bubble comes from a `message-start` event with
`role: 'user'` (`useMessages.ts` `applyUserMessageStart`), not from an
`LlmMessage`.

Consequence: hiding the reminder is entirely controlled by **which SSE event we
emit**. A reminder round emits `stop-check-reminder` (which the frontend ignores)
instead of `message-start`, so it is invisible live and on reload, with identical
behavior in both paths. No message marking is required.

## Selected Design

### 1. SSE event type

Add to `packages/sse-events/src/schema.ts`:

```ts
export const sseStopCheckReminderEventSchema = z.object({
  type: z.literal('stop-check-reminder'),
  checkNames: z.array(z.string()), // which checks fired this round (debug)
  content: z.string(), // merged reminder text, unwrapped
  messageId: z.string(),
  createdAt: z.number(),
});
```

Add `SseStopCheckReminderEvent` to the exported TS types and include the schema in
the `SseEvent` union so it is parsed/validated on deserialization and persisted to
`sse-events.jsonl` like any other event.

`content` stores the **unwrapped** reminder text. The `<system-reminder>` wrapper
is added only when injecting to the LLM (step 3), keeping the persisted event
human-readable for debugging.

### 2. StopCheck interface and registry

New directory `apps/backend/src/agent-core/agent/stop-checks/`.

`types.ts`:

```ts
export interface StopCheckContext {
  readonly runtimeState: AgentRuntimeState;
}

export interface StopCheck {
  readonly name: string;
  // Returns reminder text to block the turn from ending, or null to allow it.
  // May be sync or async — async checks (e.g. shelling out to `git status`)
  // are supported.
  evaluate(ctx: StopCheckContext): string | null | Promise<string | null>;
}
```

`todo-stop-check.ts` (first implementation):

```ts
export const todoStopCheck: StopCheck = {
  name: 'incomplete-todos',
  evaluate({runtimeState}) {
    const todos = runtimeState.listTodos();
    if (todos.length === 0) return null;
    const unfinished = todos.filter((t) => t.status !== 'completed');
    if (unfinished.length === 0) return null;
    return (
      `Note: the TODO list still has ${unfinished.length} unfinished ` +
      `item(s):\n` +
      unfinished.map((t) => `- [${t.status}] ${t.subject}`).join('\n') +
      `\nThis is just a reminder of the current state. If they are done, ` +
      `update their status; if they are intentionally being left for later ` +
      `or are no longer needed, you can proceed.`
    );
  },
};
```

`index.ts`:

```ts
export const defaultStopChecks: readonly StopCheck[] = [todoStopCheck];
```

`evaluate` may be sync or async, and reads a `runtimeState` snapshot. The
`incomplete-todos` check is sync (memory read only), but the signature allows
future IO-bound checks (e.g. `git status`) without an interface change. Each
check owns its full reminder wording. Checks are injected through
`RunAgentTurnInput` (new field `readonly stopChecks: readonly StopCheck[]`) rather
than imported directly into the turn runner, matching the existing
`toolRegistries`/`skillRegistries` injection style and keeping the runner
testable.

### 3. LlmSession.sendReminder

Add to `llm-session.ts`, symmetric with `sendUserMessage` (`llm-session.ts:97`):

```ts
sendReminder(
  content: string,
  tools: readonly ToolDefinition[],
  systemPrompt: string,
  thinkingLevel: ThinkingLevel,
  signal?: AbortSignal,
): SendUserMessageResult {
  const reminderMessage = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    role: 'user' as const,
    content: `<system-reminder>\n${content}\n</system-reminder>`,
  };
  return {
    stream: this.sendMessages(
      [reminderMessage],
      tools,
      systemPrompt,
      thinkingLevel,
      signal,
    ),
    messageId: reminderMessage.id,
    createdAt: reminderMessage.createdAt,
  };
}
```

- Injects a plain `user` message — no marking, since the frontend never sees
  `LlmMessage`.
- The `<system-reminder>` wrapper is applied **here and only here**. The SSE
  event's `content` (step 1) is the unwrapped text.
- Reuses `sendMessages`, inheriting mutex serialization, rollback on
  failure/abort, and pre-call compaction — the same robust path as normal
  messages.
- Returns `SendUserMessageResult`. The runner forwards its `messageId`/`createdAt`
  into the `stop-check-reminder` event so the event id matches the LLM-history
  message id (debug correlation), but does **not** emit a `message-start`.

### 4. Turn-runner control flow (Approach A)

Rewrite the loop in `agent-turn-runner.ts:111` from `while (toolCalls.length > 0)`
to `while (true)`, handling the no-tool-calls branch at the top:

```ts
let round = 0;
while (true) {
  if (input.signal.aborted) {
    yield* this.emitAbortCompletion({inFlightToolCalls, tools: toolDefs, systemPrompt, input});
    return;
  }

  // No tool calls → the turn would end. Run stop-checks first.
  if (toolCalls.length === 0) {
    const reminder = await this.evaluateStopChecks(input.stopChecks, input.runtimeState);
    if (!reminder) break; // all checks allow the turn to end

    round++;
    if (round > maxRounds) {
      yield* this.emitDoneAfterTurn({reason: 'max_rounds_reached', tools: toolDefs, systemPrompt, input});
      return;
    }

    const {stream, messageId, createdAt} = input.llmSession.sendReminder(
      reminder.content, toolDefs, systemPrompt, input.thinkingLevel, input.signal,
    );
    yield {
      type: 'stop-check-reminder',
      checkNames: reminder.checkNames,
      content: reminder.content,
      messageId,
      createdAt,
    } satisfies SseStopCheckReminderEvent;

    try {
      toolCalls = yield* agentLlmStreamTranslator.consume(stream);
    } catch (error: unknown) {
      if (input.signal.aborted) {
        yield* this.emitAbortCompletion({inFlightToolCalls, tools: toolDefs, systemPrompt, input});
        return;
      }
      throw error;
    }
    yield await agentUsageReporter.buildUsageUpdateEvent(input);
    continue;
  }

  // toolCalls.length > 0 → existing tool-execution body, unchanged
  round++;
  if (round > maxRounds) { /* emit max_rounds_reached, return */ }
  // ...existing execution, SSE pumping, submitToolResults...
  toolCalls = yield* agentLlmStreamTranslator.consume(
    input.llmSession.submitToolResults(orderedResults, toolDefs, systemPrompt, input.thinkingLevel, input.signal),
  );
}

yield* this.emitDoneAfterTurn({reason: 'complete', tools: toolDefs, systemPrompt, input});
```

Helper:

```ts
private async evaluateStopChecks(
  stopChecks: readonly StopCheck[],
  runtimeState: AgentRuntimeState,
): Promise<{checkNames: string[]; content: string} | null> {
  const settled = await Promise.allSettled(
    stopChecks.map(async (check) => ({
      name: check.name,
      content: await check.evaluate({runtimeState}),
    })),
  );

  const fired: {name: string; content: string}[] = [];
  for (const [i, result] of settled.entries()) {
    if (result.status === 'rejected') {
      logger.error(
        {err: result.reason, check: stopChecks[i].name},
        'Stop-check evaluation failed; skipping',
      );
      continue;
    }
    if (result.value.content !== null) {
      fired.push({name: result.value.name, content: result.value.content});
    }
  }

  if (fired.length === 0) return null;
  return {
    checkNames: fired.map((f) => f.name),
    content: fired.map((f) => f.content).join('\n\n'),
  };
}
```

Checks run concurrently via `Promise.allSettled`. A rejected check (e.g. a
future IO check whose subprocess fails) is logged via `logger` (from
`@/logger.js`, per backend conventions — no `console`) and skipped, contributing
nothing to the reminder. The rejected `result` carries no name, so `stopChecks[i]`
is used to identify the failed check. One broken check neither aborts the round
nor leaks a partial result to the LLM.

Design points:

- **Merged, not short-circuited.** All unsatisfied checks are collected in one
  pass and their texts joined with `\n\n` into a single reminder. The agent sees
  every pending problem at once and can resolve them together, rather than one per
  round. No numbering or headings are added — each check's text is already
  self-contained.
- **Shared round counter.** Reminder rounds and tool rounds increment the same
  `round` and share `maxRounds`. A turn whose tool rounds already approach the
  ceiling has correspondingly fewer reminder rounds left — a single anti-spin
  gate. An agent that repeatedly ignores reminders burns rounds until
  `max_rounds_reached`; it cannot loop forever.
- **Stateless.** No "fired once" tracking. The boundary re-evaluates every time
  the LLM returns no tool calls; an unsatisfied check keeps reminding until
  satisfied or `maxRounds` hits.
- **Abort** is checked at the loop top and around `consume`, matching existing
  handling.
- A reminder round emits `stop-check-reminder` and **never** `message-start` —
  this is the entire implementation of "hidden".

### 5. Frontend: ignore the event

The only frontend change is in the SSE dispatch `switch` in `useStreamChat.ts`:

```ts
case 'stop-check-reminder':
  // Hidden reminder: not routed to the UI. Still in sse-events.jsonl for debug.
  break;
```

Not calling `routeBaseEventToBus` keeps it out of the event bus, so rendering
layers (`useMessages`, etc.) never see it — invisible live and on reload. An
explicit `case` (rather than falling through to `default`) avoids unknown-event
warnings and documents the deliberate non-rendering. The Zod schema from step 1
ensures the event deserializes without error during replay.

## Error Handling

- **Abort during a reminder round:** handled identically to a tool round —
  `emitAbortCompletion` runs and the turn ends with `reason: 'aborted'`.
- **`maxRounds` reached via reminder rounds:** the turn ends with
  `reason: 'max_rounds_reached'`, same as tool-round exhaustion. This is the
  termination guarantee for an agent that ignores reminders.
- **`sendReminder` stream failure:** propagates through the same `try/catch` as
  `submitToolResults`; on abort it ends cleanly, otherwise it rethrows.
- **A `StopCheck.evaluate` rejecting/throwing:** `evaluateStopChecks` runs checks
  through `Promise.allSettled`, so a rejected check is logged via `logger.error`
  and skipped (treated as "allow"). It does not abort the round, affect other
  checks, or leak a partial result to the LLM.

## Testing

Backend (`agent-turn-runner` tests, `stop-checks` tests):

- With an incomplete TODO list and a model that returns no tool calls, the runner
  emits exactly one `stop-check-reminder` event and issues a `sendReminder`
  follow-up round.
- With all TODOs `completed` (or an empty list), no reminder is emitted and the
  turn ends with `reason: 'complete'`.
- Multiple unsatisfied checks merge into one reminder: `checkNames` lists all
  fired checks and `content` contains each check's text joined by `\n\n`.
- An agent that returns no tool calls and never satisfies the check terminates at
  `maxRounds` with `reason: 'max_rounds_reached'` (no infinite loop).
- Reminder rounds and tool rounds share the `round` counter: a turn near the
  ceiling does not get extra reminder rounds.
- The `stop-check-reminder` round does not emit a `message-start` event.
- `evaluateStopChecks` returns `null` when all checks pass and a merged result
  when any fire.
- `evaluateStopChecks` runs checks concurrently; a check that rejects is logged
  and skipped, while other checks' results still merge into the reminder.
- `sendReminder` wraps `content` in `<system-reminder>` and records a `user`
  message in history; its returned `messageId` matches the emitted event's
  `messageId`.

Frontend (`useStreamChat` / message-rendering tests):

- A `stop-check-reminder` event is not routed to the event bus and produces no
  chat message, both live and on replay.

## Open Decisions

None. A stateful "remind only when state changes" policy is intentionally out of
scope; the stateless merged-reminder design with a shared `maxRounds` ceiling and
`allSettled` per-check error isolation is sufficient for the current checks.
