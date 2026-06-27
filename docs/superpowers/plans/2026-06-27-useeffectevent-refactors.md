# `useEffectEvent` Refactors (Frontend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adopt React 19.2's `useEffectEvent` in the four frontend Effects where a long-lived setup (subscription / observer / SSE connection / message forwarding) is conceptually keyed on one lifecycle value but currently lists non-reactive logic in its dependency array.

**Architecture:** Each refactor follows the same shape — move the non-reactive part of an Effect (the part that reads the _latest_ callback/state but should not re-trigger the setup) into a `useEffectEvent`, then shrink the Effect's dependency array to only the true lifecycle key. Behavior is preserved; the dependency array becomes an honest statement of when the setup must be torn down and rebuilt. The motivation is **semantic correctness** (the code should say what it means), with reduced observer/connection churn as a side benefit.

**Tech Stack:** React 19.2.7, TypeScript, Vite, Vitest 4 + jsdom + `@testing-library/react`, `eslint-plugin-react-hooks` 7.1.1.

## Global Constraints

- **React API:** Import `useEffectEvent` from `'react'` (stable since 19.2 — not `react/experimental`). Installed: `react` 19.2.7, `@types/react` 19.2.17.
- **Lint:** `eslint-plugin-react-hooks` 7.1.1 knows Effect Events are non-reactive — it _requires_ them to be **omitted** from dependency arrays. Do not add an Effect Event to a dependency array.
- **Effect Event rules:** Never call an Effect Event during render. Declare it in the hook body and call it only from inside Effects (or event handlers). Do not pass an Effect Event across hook/component boundaries as a prop — keep each one inside the hook that owns its Effect.
- **Runtime APIs:** Node APIs only in source (`node:*`). No `Bun.*`. (Irrelevant to these files but repo-wide.)
- **Test runner:** `bun run test` (→ `vitest run`). **Never** `bun test` (Bun's runner produces false failures here).
- **Test environment:** jsdom. It does **not** implement `IntersectionObserver`; tests that touch it must stub it via `vi.stubGlobal`. `requestAnimationFrame` is stubbed in tests that need deterministic frames (see existing `useStreamChat.test.tsx` / `useFrameBatchedState.test.ts`).
- **Commit trailer:** End every commit message with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **Working directory:** All `bun run …` / `bunx …` commands below are run from `apps/frontend/` unless stated otherwise.
- **Do not** restyle, rename, or change public signatures of these hooks/components. These are internal refactors; the exported interfaces stay identical.

---

## File Structure

| File                                                                     | Responsibility                                                                 | Action                                                                             |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `apps/frontend/src/hooks/useInfiniteList.ts`                             | Offset/limit pagination state machine                                          | Modify: first-page Effect → Effect Event                                           |
| `apps/frontend/src/hooks/useInfiniteList.test.tsx`                       | Proves the first-page fetch is keyed on pageSize/refresh, not fetcher identity | Create                                                                             |
| `apps/frontend/src/hooks/useInfiniteScroll.ts`                           | `IntersectionObserver` sentinel over `useInfiniteList`                         | Modify: observer Effect → Effect Event                                             |
| `apps/frontend/src/hooks/useInfiniteScroll.test.tsx`                     | Proves the observer is keyed on `hasMore`, not `loadMore` identity             | Create                                                                             |
| `apps/frontend/src/modules/chat-stream/StreamingMessageDisplay.tsx`      | Forwards the message list to `onMessagesChange`                                | Modify: replace hand-rolled `ref`+`useLayoutEffect` polyfill with `useEffectEvent` |
| `apps/frontend/src/modules/chat-stream/StreamingMessageDisplay.test.tsx` | Characterizes latest-callback forwarding semantics                             | Create                                                                             |
| `apps/frontend/src/modules/chat-session/hooks/useStreamChat.ts`          | Persistent SSE connection + send                                               | Modify: connection Effect keyed on `sessionId` only                                |
| `apps/frontend/src/modules/chat-session/hooks/useStreamChat.test.tsx`    | Existing suite + new "no reconnect on api identity change" test                | Modify (append one test)                                                           |

**Task order & independence:** Tasks 1–4 touch disjoint files and can be reviewed/committed independently. Recommended order is as numbered (the two real-churn fixes first, then the polyfill cleanup, then the defensive SSE change). Task 2 imports the hook fixed in Task 1 but does not depend on Task 1's change being present.

---

### Task 1: `useInfiniteList` — first-page fetch as an Effect Event

**Why:** The initial-load Effect's deps are `[fetcher, pageSize, refreshKey]`. Callers routinely pass a **fresh inline `fetcher` every render** (e.g. `useSessionList` defines `async (offset, limit) => {…}` in its render body), so `fetcher`'s identity changes constantly and re-triggers a first-page refetch that should only happen on mount / `pageSize` change / explicit refresh. `fetcher` is _data-source_ logic the Effect should read at its latest value, not a reason to refetch.

**Files:**

- Modify: `apps/frontend/src/hooks/useInfiniteList.ts:64-95` (the "Initial load / refresh" Effect)
- Test: `apps/frontend/src/hooks/useInfiniteList.test.tsx` (create)

**Interfaces:**

- Consumes: nothing new.
- Produces: `useInfiniteList(<UseInfiniteListOptions<T>>)` keeps its exact return shape (`items, isLoadingInitial, isLoadingMore, error, hasMore, loadMore, refresh, backgroundRefresh`). No signature change.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/hooks/useInfiniteList.test.tsx`:

```tsx
import {act, renderHook, waitFor} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';

import type {Fetcher} from './useInfiniteList.js';
import {useInfiniteList} from './useInfiniteList.js';

afterEach(() => {
  vi.restoreAllMocks();
});

/** Underlying spy shared by every inline fetcher so we can count real calls. */
function makeUnderlying(total: number) {
  return vi.fn(async (offset: number, limit: number) => ({
    items: Array.from({length: Math.min(limit, total - offset)}, (_v, i) => ({
      id: offset + i,
    })),
    total,
  }));
}

describe('useInfiniteList', () => {
  it('fetches the first page once even when the fetcher identity changes every render', async () => {
    const underlying = makeUnderlying(10);
    // Each render hands the hook a brand-new inline fetcher, exactly like a
    // caller that defines `async (o, l) => {…}` inside its render body.
    const makeFetcher = (): Fetcher<{id: number}> => (o, l) => underlying(o, l);

    const {rerender} = renderHook(
      ({fetcher}) => useInfiniteList({fetcher, pageSize: 2}),
      {initialProps: {fetcher: makeFetcher()}},
    );

    await act(async () => {
      rerender({fetcher: makeFetcher()});
    });
    await act(async () => {
      rerender({fetcher: makeFetcher()});
    });

    const firstPageCalls = underlying.mock.calls.filter(
      ([offset]) => offset === 0,
    ).length;
    expect(firstPageCalls).toBe(1);
  });

  it('refetches the first page when refresh() is called', async () => {
    const underlying = makeUnderlying(10);
    const fetcher: Fetcher<{id: number}> = (o, l) => underlying(o, l);

    const {result} = renderHook(() => useInfiniteList({fetcher, pageSize: 2}));

    await waitFor(() => {
      expect(result.current.isLoadingInitial).toBe(false);
    });
    expect(underlying.mock.calls.filter(([o]) => o === 0).length).toBe(1);

    act(() => {
      result.current.refresh();
    });

    await waitFor(() => {
      expect(underlying.mock.calls.filter(([o]) => o === 0).length).toBe(2);
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test useInfiniteList`
Expected: The first test FAILS — current deps `[fetcher, pageSize, refreshKey]` refetch page 0 on every rerender, so `firstPageCalls` is `3`, not `1`. (The `refresh()` test passes already.)

- [ ] **Step 3: Implement — move the first-page fetch into an Effect Event**

In `apps/frontend/src/hooks/useInfiniteList.ts`, add `useEffectEvent` to the React import (line 1):

```ts
import {useCallback, useEffect, useEffectEvent, useRef, useState} from 'react';
```

Replace the entire "Initial load / refresh" Effect (currently lines 64-95) with:

```ts
// Loads the first page. Declared as an Effect Event so the Effect below can
// read the latest `fetcher` without listing it as a dependency — callers
// commonly pass a fresh inline fetcher on every render, which would otherwise
// re-trigger a first-page fetch each render. `pageSize` is passed in so it
// stays a genuine reactive trigger of the Effect.
const fetchFirstPage = useEffectEvent(
  async (limit: number, isCancelled: () => boolean) => {
    if (showLoadingRef.current) {
      setIsLoadingInitial(true);
    }
    setError(null);
    try {
      const page = await fetcher(0, limit);
      if (isCancelled()) return;
      setItems(page.items);
      setTotal(page.total);
    } catch (e: unknown) {
      if (isCancelled()) return;
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      if (!isCancelled()) {
        setIsLoadingInitial(false);
      }
    }
  },
);

// Initial load / refresh. Re-runs only when the page size changes or a
// refresh is requested — not when the fetcher's identity changes.
useEffect(() => {
  let cancelled = false;
  void fetchFirstPage(pageSize, () => cancelled);
  return () => {
    cancelled = true;
  };
}, [pageSize, refreshKey]);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test useInfiniteList`
Expected: PASS (both tests).

- [ ] **Step 5: Lint the changed file**

Run: `bunx eslint src/hooks/useInfiniteList.ts`
Expected: no errors. (`refreshKey` listed-but-unused-in-body is already the established pattern in this file; `fetcher` lives only inside the Effect Event so `react-hooks/exhaustive-deps` does not require it.)

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/hooks/useInfiniteList.ts apps/frontend/src/hooks/useInfiniteList.test.tsx
git commit -m "$(cat <<'EOF'
refactor(frontend): key useInfiniteList first-page fetch on pageSize, not fetcher identity

Move the first-page fetch into a useEffectEvent so an unstable inline
fetcher no longer re-triggers a refetch on every render.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `useInfiniteScroll` — `IntersectionObserver` as an Effect Event

**Why:** The observer Effect's deps are `[hasMore, loadMore]`. `loadMore` (from `useInfiniteList`) has deps `[fetcher, pageSize, isLoadingMore, hasMore, items.length]`, so its identity changes on **every page append** (`items.length`) and on every `isLoadingMore` toggle. Each change disconnects and rebuilds the `IntersectionObserver`. The observer's only real lifecycle key is `hasMore` (no sentinel when there is nothing more to load). Calling `loadMore()` is non-reactive logic that belongs in an Effect Event.

**Files:**

- Modify: `apps/frontend/src/hooks/useInfiniteScroll.ts:59-79` (the observer Effect)
- Test: `apps/frontend/src/hooks/useInfiniteScroll.test.tsx` (create)

**Interfaces:**

- Consumes: `useInfiniteList` (unchanged from Task 1).
- Produces: `useInfiniteScroll(<UseInfiniteScrollOptions<T>>)` keeps its exact return shape including `sentinelRef: RefObject<HTMLDivElement | null>`. No signature change.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/hooks/useInfiniteScroll.test.tsx`:

```tsx
import {act, render, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import type {Fetcher} from './useInfiniteList.js';
import {useInfiniteScroll} from './useInfiniteScroll.js';

/** Captures every constructed IntersectionObserver; jsdom has none. */
class IntersectionObserverStub {
  static instances: IntersectionObserverStub[] = [];
  callback: IntersectionObserverCallback;
  disconnected = false;
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    IntersectionObserverStub.instances.push(this);
  }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {
    this.disconnected = true;
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  /** Simulate the sentinel scrolling into view. */
  fire(): void {
    this.callback(
      [{isIntersecting: true} as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

function Harness({fetcher}: {fetcher: Fetcher<{id: number}>}) {
  const {items, hasMore, sentinelRef} = useInfiniteScroll({
    fetcher,
    pageSize: 2,
  });
  return (
    <div>
      <span data-testid='count'>{items.length}</span>
      <span data-testid='hasMore'>{String(hasMore)}</span>
      {hasMore ? <div ref={sentinelRef} /> : null}
    </div>
  );
}

beforeEach(() => {
  IntersectionObserverStub.instances = [];
  vi.stubGlobal('IntersectionObserver', IntersectionObserverStub);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useInfiniteScroll', () => {
  it('reuses one IntersectionObserver across page loads while hasMore stays true', async () => {
    const fetcher: Fetcher<{id: number}> = async (offset, limit) => ({
      items: Array.from({length: limit}, (_v, i) => ({id: offset + i})),
      total: 100,
    });

    const {getByTestId} = render(<Harness fetcher={fetcher} />);

    await waitFor(() => {
      expect(getByTestId('count').textContent).toBe('2');
    });
    expect(IntersectionObserverStub.instances).toHaveLength(1);

    // Load two more pages by firing the (single) observer.
    for (const expected of ['4', '6']) {
      await act(async () => {
        IntersectionObserverStub.instances.at(-1)?.fire();
      });
      await waitFor(() => {
        expect(getByTestId('count').textContent).toBe(expected);
      });
    }

    // hasMore never flipped, so the observer must not have been rebuilt.
    expect(IntersectionObserverStub.instances).toHaveLength(1);
    expect(IntersectionObserverStub.instances[0].disconnected).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test useInfiniteScroll`
Expected: FAIL — current deps `[hasMore, loadMore]` rebuild the observer each time `items.length` changes, so `instances` length is `3` (one per page) and `instances[0].disconnected` is `true`.

- [ ] **Step 3: Implement — move the `loadMore()` call into an Effect Event**

In `apps/frontend/src/hooks/useInfiniteScroll.ts`, update the React import (line 2):

```ts
import {useEffect, useEffectEvent, useRef} from 'react';
```

Replace the observer Effect (currently lines 59-79) with:

```ts
// Calling loadMore is non-reactive: the observer should not be rebuilt just
// because loadMore's identity changed (it changes on every page append).
const onSentinelVisible = useEffectEvent(() => {
  loadMore();
});

useEffect(() => {
  const sentinel = sentinelRef.current;
  if (!sentinel || !hasMore) {
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      if (entries[0]?.isIntersecting) {
        onSentinelVisible();
      }
    },
    {threshold: 0},
  );

  observer.observe(sentinel);

  return () => {
    observer.disconnect();
  };
}, [hasMore]);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test useInfiniteScroll`
Expected: PASS.

- [ ] **Step 5: Lint the changed file**

Run: `bunx eslint src/hooks/useInfiniteScroll.ts`
Expected: no errors. The Effect body references `hasMore` (used) and `sentinelRef` (a ref, exempt); `loadMore` lives in the Effect Event, so deps `[hasMore]` is complete and correct.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/hooks/useInfiniteScroll.ts apps/frontend/src/hooks/useInfiniteScroll.test.tsx
git commit -m "$(cat <<'EOF'
refactor(frontend): key useInfiniteScroll observer on hasMore, not loadMore identity

Wrap the loadMore() call in a useEffectEvent so the IntersectionObserver is
built once per hasMore window instead of being rebuilt on every page append.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `StreamingMessageDisplay` — replace the hand-rolled Effect Event polyfill

**Why:** `StreamingMessageDisplayInner` uses `callbackRef` + `useLayoutEffect` to call the latest `onMessagesChange` from a `[messages]`-only Effect. That `ref`-latching pattern **is** the manual polyfill `useEffectEvent` was designed to replace. Behavior is already correct; this swap makes the intent explicit and deletes the boilerplate. (No performance change — purely semantic/readability.)

**Files:**

- Modify: `apps/frontend/src/modules/chat-stream/StreamingMessageDisplay.tsx:39-55` (the `StreamingMessageDisplayInner` component)
- Test: `apps/frontend/src/modules/chat-stream/StreamingMessageDisplay.test.tsx` (create)

**Interfaces:**

- Consumes: `StreamingMessageDisplay` props (`eventBus`, `onAskUserSubmit`, `onMessagesChange?`) — unchanged.
- Produces: identical rendered output and identical `onMessagesChange` call semantics (called with the latest message list whenever messages change; always the latest callback).

> **TDD note:** This is a behavior-preserving refactor, so the test is a **characterization/regression guard** — it must pass on the _current_ implementation and continue to pass after the swap. There is no red phase here; the value is locking the latest-callback semantics so the refactor can't silently break them.

- [ ] **Step 1: Write the characterization test**

Create `apps/frontend/src/modules/chat-stream/StreamingMessageDisplay.test.tsx`:

```tsx
import {act, cleanup, render} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {ThemeProvider} from '@/contexts/theme/index.js';
import type {ChatMessage} from '@/modules/chat-events/index.js';
import {EventBus} from '@/helpers/event-bus.js';
import type {ChatEventMap} from '@/modules/chat-events/index.js';

import {StreamingMessageDisplay} from './index.js';

let rafCallbacks: Map<number, FrameRequestCallback>;
let nextRafId: number;

function mockRaf(cb: FrameRequestCallback): number {
  const id = nextRafId++;
  rafCallbacks.set(id, cb);
  return id;
}

function mockCancelRaf(id: number): void {
  rafCallbacks.delete(id);
}

function flushRaf(): void {
  const callbacks = [...rafCallbacks.values()];
  rafCallbacks.clear();
  for (const callback of callbacks) {
    callback(0);
  }
}

beforeEach(() => {
  rafCallbacks = new Map();
  nextRafId = 1;
  vi.stubGlobal('requestAnimationFrame', mockRaf);
  vi.stubGlobal('cancelAnimationFrame', mockCancelRaf);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('StreamingMessageDisplay onMessagesChange forwarding', () => {
  it('always invokes the latest onMessagesChange with the current messages', () => {
    const bus = new EventBus<ChatEventMap>();
    const first = vi.fn<(messages: readonly ChatMessage[]) => void>();
    const second = vi.fn<(messages: readonly ChatMessage[]) => void>();

    const {rerender} = render(
      <StreamingMessageDisplay
        eventBus={bus}
        onAskUserSubmit={null}
        onMessagesChange={first}
      />,
      {wrapper: ThemeProvider},
    );

    act(() => {
      bus.emit('user-message-sent', {content: 'hello'});
      flushRaf();
    });

    expect(first).toHaveBeenCalled();
    const firstArg = first.mock.calls.at(-1)?.[0];
    expect(firstArg?.some((m) => m.role === 'user')).toBe(true);

    // Swap the callback; the new one must receive subsequent updates.
    rerender(
      <StreamingMessageDisplay
        eventBus={bus}
        onAskUserSubmit={null}
        onMessagesChange={second}
      />,
    );
    first.mockClear();

    act(() => {
      bus.emit('text-delta', {type: 'text-delta', content: 'world'});
      flushRaf();
    });

    expect(second).toHaveBeenCalled();
    expect(first).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it passes on the current implementation**

Run: `bun run test StreamingMessageDisplay`
Expected: PASS (characterizes the existing `callbackRef` behavior). If it fails, stop — the harness assumptions (event names / rAF batching) are wrong and must be fixed before refactoring.

- [ ] **Step 3: Implement — swap the ref polyfill for `useEffectEvent`**

Replace the imports line and the `StreamingMessageDisplayInner` component in `apps/frontend/src/modules/chat-stream/StreamingMessageDisplay.tsx`.

Change line 1 from:

```ts
import {useEffect, useLayoutEffect, useRef} from 'react';
```

to:

```ts
import {useEffect, useEffectEvent} from 'react';
```

Replace `StreamingMessageDisplayInner` (currently lines 39-55) with:

```tsx
function StreamingMessageDisplayInner({
  onMessagesChange,
}: {
  onMessagesChange?: (messages: readonly ChatMessage[]) => void;
}) {
  const {messages} = useMessages();

  const notifyMessagesChange = useEffectEvent(
    (current: readonly ChatMessage[]) => {
      onMessagesChange?.(current);
    },
  );

  useEffect(() => {
    notifyMessagesChange(messages);
  }, [messages]);

  return <StreamingMessageDisplayView messages={messages} />;
}
```

- [ ] **Step 4: Run the test to verify it still passes**

Run: `bun run test StreamingMessageDisplay`
Expected: PASS (behavior unchanged).

- [ ] **Step 5: Lint the changed file**

Run: `bunx eslint src/modules/chat-stream/StreamingMessageDisplay.tsx`
Expected: no errors and no unused-import warnings (`useLayoutEffect` and `useRef` are gone).

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/modules/chat-stream/StreamingMessageDisplay.tsx apps/frontend/src/modules/chat-stream/StreamingMessageDisplay.test.tsx
git commit -m "$(cat <<'EOF'
refactor(frontend): use useEffectEvent for StreamingMessageDisplay message forwarding

Replace the hand-rolled callbackRef + useLayoutEffect latch with the
useEffectEvent it was emulating. Same behavior, less boilerplate.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `useStreamChat` — key the SSE connection on `sessionId` only

**Why:** The persistent SSE Effect's deps are `[sessionId, eventBus, subscribeEvents]`. The connection's true lifecycle key is `sessionId`; `eventBus` and `subscribeEvents` are read _inside_ the consume loop and should be used at their latest value, not re-trigger a full teardown + reconnect-from-index-0. Today both happen to be stable (`eventBus` is `useState(() => new EventBus())`; `subscribeEvents` comes from an `import * as chatApi` module namespace), so this is **defensive / correctness-by-construction** rather than a current bug — but the dependency array should state the real invariant.

**Files:**

- Modify: `apps/frontend/src/modules/chat-session/hooks/useStreamChat.ts` (imports + the persistent SSE Effect at lines 59-205)
- Test: `apps/frontend/src/modules/chat-session/hooks/useStreamChat.test.tsx` (append one test)

**Interfaces:**

- Consumes: `SseEventCursorEntry` from `@omnicraft/sse-events` (the element type yielded by `ChatSessionApi['subscribeEvents']`); `SseEventCursorEntry['event']` is the stream-event union the dispatcher switches on.
- Produces: `useStreamChat({sessionId, createNewSessionId})` keeps its exact return shape (`isStreaming, isReconnecting, streamError, maxRoundsReached, sendMessage, sendMessageToNewSession, stopGeneration, clearStreamError, clearMaxRoundsReached`). No signature change.

> **Risk to verify:** the consume loop calls its Effect Events from an `async` continuation of the Effect (post-`await`), not synchronously inside the Effect. `useEffectEvent` only forbids calls _during render_; calling later reads the latest committed version and is fine at runtime. The existing 7 tests in this file (especially "reconnects with the backend-provided raw cursor after a replay event") are the safety net — they must stay green.

- [ ] **Step 1: Write the failing test**

Append this test inside the existing `describe('useStreamChat', …)` block in `apps/frontend/src/modules/chat-session/hooks/useStreamChat.test.tsx` (it reuses the file's existing `createApiWithSubscribeEvents`, `StreamOnlyHarnessContent`, `flushAsyncWork`, `ChatSessionApiContext`, `ChatEventBusProvider`, and `ThemeProvider` helpers):

```tsx
it('does not reconnect when the api identity changes but the session stays the same', async () => {
  const openForever = (): ChatSessionApi['subscribeEvents'] =>
    async function* (_sessionId: string, _from: number, signal?: AbortSignal) {
      yield* [];
      await new Promise<void>((resolve) => {
        signal?.addEventListener('abort', () => resolve(), {once: true});
      });
    };

  const apiA = createApiWithSubscribeEvents(openForever());
  const apiB = createApiWithSubscribeEvents(openForever());

  const tree = (api: ChatSessionApi) => (
    <ChatSessionApiContext value={api}>
      <ChatEventBusProvider>
        <StreamOnlyHarnessContent />
      </ChatEventBusProvider>
    </ChatSessionApiContext>
  );

  const {rerender, unmount} = render(tree(apiA), {wrapper: ThemeProvider});

  await flushAsyncWork();
  expect(apiA.subscribeEvents).toHaveBeenCalledTimes(1);

  // Same sessionId, brand-new api object (new subscribeEvents identity).
  rerender(tree(apiB));
  await flushAsyncWork();

  // The connection is keyed on sessionId, so swapping the api must not
  // tear it down and reconnect.
  expect(apiB.subscribeEvents).not.toHaveBeenCalled();
  expect(apiA.subscribeEvents).toHaveBeenCalledTimes(1);

  unmount();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test useStreamChat`
Expected: The new test FAILS — current deps include `subscribeEvents`, so swapping the api re-runs the Effect and calls `apiB.subscribeEvents` once (assertion `not.toHaveBeenCalled()` fails). The other 7 tests pass.

- [ ] **Step 3: Implement — extract the stream subscribe + dispatch into Effect Events**

In `apps/frontend/src/modules/chat-session/hooks/useStreamChat.ts`:

(a) Add `useEffectEvent` to the React import (line 1):

```ts
import {useCallback, useEffect, useEffectEvent, useRef, useState} from 'react';
```

(b) Add the stream-event cursor type import (place beside the other type imports near the top):

```ts
import type {SseEventCursorEntry} from '@omnicraft/sse-events';
```

(c) Immediately **before** the "Persistent SSE connection" Effect (current line 59), declare two Effect Events:

```ts
// Opens the event stream using the latest subscribeEvents. Reading it here
// (instead of as an Effect dependency) keeps the connection keyed on
// sessionId only.
const openEventStream = useEffectEvent(
  (activeSessionId: string, from: number, signal: AbortSignal) =>
    subscribeEvents(activeSessionId, from, signal),
);

// Dispatches a single stream event onto the latest eventBus. Returns true
// when the event terminates the current round (done / error).
const dispatchStreamEvent = useEffectEvent(
  (event: SseEventCursorEntry['event']): boolean => {
    const subagentBusMap = subagentBusMapRef.current;
    switch (event.type) {
      case 'message-start':
        if (event.role === 'assistant') {
          setIsStreaming(true);
        }
        routeBaseEventToBus(event, eventBus);
        break;
      case 'text-delta':
      case 'tool-execute-start':
      case 'tool-execute-end':
      case 'tool-execute-delta':
      case 'thinking-start':
      case 'thinking-delta':
      case 'thinking-end':
      case 'context-compaction-start':
      case 'context-compaction-end':
      case 'context-compaction-error':
        routeBaseEventToBus(event, eventBus);
        break;
      case 'todo-update':
        eventBus.emit('todo-update', event);
        break;
      case 'usage-update':
        routeBaseEventToBus(event, eventBus);
        break;
      case 'done':
        if (event.reason === 'max_rounds_reached') {
          setMaxRoundsReached(true);
        }
        routeBaseEventToBus(event, eventBus);
        setIsStreaming(false);
        return true;
      case 'session-title':
        eventBus.emit('session-title', event);
        break;
      case 'stop-check-reminder':
        // Hidden reminder: not routed to the UI. It remains in
        // sse-events.jsonl for debugging.
        break;
      case 'error':
        eventBus.emit('stream-error', {message: event.message});
        setStreamError(event.message);
        setIsStreaming(false);
        return true;
      case 'subagent-dispatch':
      case 'subagent-resume': {
        const bus = new SubagentEventBus();
        subagentBusMap.set(event.agentId, bus);
        eventBus.emit('subagent-dispatched', {
          mode: event.type === 'subagent-dispatch' ? 'dispatch' : 'resume',
          agentId: event.agentId,
          nickname: event.nickname,
          task: event.task,
          agentType: event.agentType,
          thinkingLevel: event.thinkingLevel,
          workingDirectory: event.workingDirectory,
          eventBus: bus,
        });
        break;
      }
      case 'subagent-output': {
        const bus = subagentBusMap.get(event.agentId);
        if (bus) routeBaseEventToBus(event.event, bus);
        break;
      }
      case 'subagent-complete': {
        eventBus.emit('subagent-completed', {
          agentId: event.agentId,
          status: event.status,
        });
        subagentBusMap.delete(event.agentId);
        break;
      }
    }
    return false;
  },
);
```

(d) Replace the body of the "Persistent SSE connection" Effect (current lines 59-205) with the version below — the consume loop now calls `openEventStream` / `dispatchStreamEvent`, and the dependency array is `[sessionId]`:

```ts
// Persistent SSE connection — connects when sessionId is set.
useEffect(() => {
  if (!sessionId) return;

  const activeSessionId = sessionId;
  const controller = new AbortController();
  const subagentBusMap = subagentBusMapRef.current;

  async function consume(): Promise<void> {
    let lastIndex = 0;
    let consecutiveFailures = 0;

    while (!controller.signal.aborted) {
      try {
        const eventStream = openEventStream(
          activeSessionId,
          lastIndex,
          controller.signal,
        );
        let receivedTerminalEvent = false;

        for await (const streamEvent of eventStream) {
          const {event, nextIndex} = streamEvent;
          if (consecutiveFailures > 0) {
            consecutiveFailures = 0;
            setIsReconnecting(false);
          }

          if (dispatchStreamEvent(event)) {
            receivedTerminalEvent = true;
          }
          lastIndex = nextIndex;
        }

        if (receivedTerminalEvent) return;
        // Stream ended without a terminal event → unexpected disconnect.
      } catch (e: unknown) {
        if (e instanceof DOMException && e.name === 'AbortError') return;

        if (!isRetriableError(e)) {
          const message =
            e instanceof Error ? e.message : 'An unexpected error occurred';
          setIsReconnecting(false);
          setStreamError(message);
          return;
        }
        // Retriable (network error / 5xx) → fall through to retry.
      }

      consecutiveFailures++;
      if (consecutiveFailures > MAX_RETRIES) {
        setIsReconnecting(false);
        setStreamError('Connection lost. Please refresh the page.');
        return;
      }

      setIsReconnecting(true);
      const delay = Math.min(
        INITIAL_DELAY_MS * 2 ** (consecutiveFailures - 1),
        MAX_DELAY_MS,
      );
      const sleptFully = await abortableSleep(delay, controller.signal);
      if (!sleptFully) return;
    }
  }

  void consume();

  return () => {
    controller.abort();
    subagentBusMap.clear();
  };
}, [sessionId]);
```

- [ ] **Step 4: Run the full `useStreamChat` suite to verify the new test passes and nothing regressed**

Run: `bun run test useStreamChat`
Expected: PASS — all 8 tests (the original 7 plus the new "does not reconnect…"). Pay special attention to "reconnects with the backend-provided raw cursor after a replay event": it must still call `subscribeEvents` with `('session-1', 0, …)` then `('session-1', 3, …)` — that reconnect is driven by the in-loop retry, not a dependency change, so it still works via `openEventStream`.

- [ ] **Step 5: Lint the changed file**

Run: `bunx eslint src/modules/chat-session/hooks/useStreamChat.ts`
Expected: no errors. The Effect body references `sessionId` (used) plus the two Effect Events (exempt) and stable setters/refs; deps `[sessionId]` is complete. `eventBus` and `subscribeEvents` are referenced only inside the Effect Events, so the rule does not require them.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/modules/chat-session/hooks/useStreamChat.ts apps/frontend/src/modules/chat-session/hooks/useStreamChat.test.tsx
git commit -m "$(cat <<'EOF'
refactor(frontend): key useStreamChat SSE connection on sessionId only

Move stream subscription and event dispatch into useEffectEvents so the
connection no longer tears down and reconnects from index 0 if eventBus or
subscribeEvents change identity. sessionId is the sole lifecycle key.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Final Verification (after all four tasks)

- [ ] **Full frontend test suite**

Run (from `apps/frontend/`): `bun run test`
Expected: all suites pass (no regressions in the broader chat / sidebar / settings tests).

- [ ] **Full lint**

Run (from `apps/frontend/`): `bun run lint`
Expected: clean.

- [ ] **Typecheck**

Run (from `apps/frontend/`): `bunx tsc -b`
Expected: no type errors. (This is the typecheck half of the `build` script.)

- [ ] **No manual browser check required**

These are internal logic refactors with zero visual/DOM-output change, so the repo's "validate UI in a browser, attach screenshots" rule does not apply. If a PR is opened, note in the description that there is no UI delta and that the four refactors are covered by unit tests.

---

## Self-Review (completed during planning)

1. **Spec coverage:** All four findings from the research are covered — Task 1 (`useInfiniteList`), Task 2 (`useInfiniteScroll`), Task 3 (`StreamingMessageDisplay`), Task 4 (`useStreamChat`). The ~20 already-optimal Effects are intentionally untouched.
2. **Placeholder scan:** Every step contains concrete code or an exact command with expected output. No TBD/TODO/"handle edge cases".
3. **Type consistency:** `useEffectEvent` imported from `'react'` in all four files; `SseEventCursorEntry['event']` (Task 4) is the exact element type of `ChatSessionApi['subscribeEvents']`; `Fetcher<T>` (Tasks 1–2) matches the `useInfiniteList` export; return shapes of all four hooks/components are unchanged.
4. **Lint invariant:** Confirmed against the existing committed code that `react-hooks/exhaustive-deps` (v7.1.1) tolerates an extra reactive dep (`refreshKey`) and does not require values read only inside an Effect Event — each task ends with a targeted `eslint` run as the gate.
   </content>
   </invoke>
