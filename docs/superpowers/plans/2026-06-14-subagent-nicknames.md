# Subagent Nicknames Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each live subagent a readable nickname (e.g. `crimson-otter`) that is the LLM-facing handle for dispatch/list/resume, while the UUID stays the internal key.

**Architecture:** A pure nickname generator feeds the in-memory `SubagentRegistry`, which assigns a nickname per live entry and resolves resume requests by nickname. The dispatch tool generates the nickname before the turn starts (so it can return it) and registers at the existing post-turn-start point. Nicknames flow through the SSE `subagent-dispatch`/`subagent-resume` start payload (optional, for back-compat) to the frontend, which shows the nickname in place of the UUID. Nothing is persisted.

**Tech Stack:** TypeScript, Bun (package manager/runtime, Node APIs in code), Vitest, Zod, React.

**Spec:** `docs/superpowers/specs/2026-06-14-subagent-nicknames-design.md`

---

## File Structure

**Backend (`apps/backend`):**

- Create `src/agent-core/agent/state/nickname.ts` — pure generator (`adjectives`, `nouns`, `createNickname`).
- Create `src/agent-core/agent/state/nickname.test.ts`.
- Modify `src/agent-core/agent/state/subagent-registry.ts` — nickname on entry, `generateNickname()`, `register(..., nickname?)`, `getByNickname()`, `list()` includes nickname, `LiveSubagentHandle.nickname`.
- Modify `src/agent/tools/sub-agent/subagent-turn-runner.ts` — `nickname` on `RunSubagentTurnInput`, nickname in success content.
- Modify `src/agent/tools/sub-agent/dispatch-agent-tool.ts` — generate nickname early, thread it, register with it, description update.
- Modify `src/agent/tools/sub-agent/resume-agent-tool.ts` — `name` param, `getByNickname`, drop UUID validation.
- Modify `src/agent/tools/sub-agent/list-resumable-agents-tool.ts` — nickname in output/data.
- Update the matching `*.test.ts` files.

**SSE schema (`packages/sse-events`):**

- Modify `src/schema.ts` — `nickname: z.string().optional()` on `sseSubagentStartPayloadSchema`.

**Frontend (`apps/frontend`):**

- Modify `src/modules/chat-session/hooks/useStreamChat.ts` — pass `nickname` through.
- Modify `src/modules/chat-session/components/StreamingMessageDisplay/types.ts` — `nickname?` on `SubagentContent` and `subagent-dispatched`.
- Modify `src/modules/chat-session/components/StreamingMessageDisplay/hooks/useMessages.ts` — thread `nickname`.
- Modify `.../SubagentDisclosure/SubagentDisclosure.tsx` + `SubagentDisclosureView.tsx` — name row, `nickname ?? agentId`.
- Update `SubagentDisclosureView.test.tsx`.

**Test commands:**

- Backend: `cd apps/backend && bun run test <filter>`
- Frontend: `cd apps/frontend && bun run test <filter>`

---

## Task 1: SSE start payload carries an optional nickname

**Files:**

- Modify: `packages/sse-events/src/schema.ts:236-242`

- [ ] **Step 1: Add the optional field**

In `packages/sse-events/src/schema.ts`, replace the `sseSubagentStartPayloadSchema` definition (currently lines 236-242):

```ts
const sseSubagentStartPayloadSchema = z.object({
  agentId: agentIdSchema,
  // Readable LLM-facing handle for the live subagent. Optional only for
  // backward compatibility with events persisted before nicknames existed.
  nickname: z.string().optional(),
  task: z.string(),
  agentType: subAgentTypeSchema,
  thinkingLevel: thinkingLevelSchema,
  workingDirectory: z.string(),
});
```

- [ ] **Step 2: Typecheck the package**

Run: `cd packages/sse-events && bun run typecheck 2>/dev/null || cd /Users/soulike/.superset/worktrees/omni-craft/rightful-voice && bunx tsc -p packages/sse-events --noEmit`
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add packages/sse-events/src/schema.ts
git commit -m "feat(sse): add optional nickname to subagent start payload"
```

---

## Task 2: Pure nickname generator

**Files:**

- Create: `apps/backend/src/agent-core/agent/state/nickname.ts`
- Test: `apps/backend/src/agent-core/agent/state/nickname.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/agent-core/agent/state/nickname.test.ts`:

```ts
import {describe, expect, it} from 'vitest';

import {adjectives, createNickname, nouns} from './nickname.js';

describe('createNickname', () => {
  it('produces an adjective-noun handle', () => {
    const nickname = createNickname(new Set());
    expect(nickname).toMatch(/^[a-z]+-[a-z]+$/);
    const [adjective, noun] = nickname.split('-');
    expect(adjectives).toContain(adjective);
    expect(nouns).toContain(noun);
  });

  it('never returns a value already in the taken set', () => {
    const taken = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const nickname = createNickname(taken);
      expect(taken.has(nickname)).toBe(false);
      taken.add(nickname);
    }
  });

  it('ships enough words to make collisions rare', () => {
    expect(adjectives.length).toBeGreaterThanOrEqual(50);
    expect(nouns.length).toBeGreaterThanOrEqual(50);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun run test nickname`
Expected: FAIL — cannot resolve `./nickname.js`.

- [ ] **Step 3: Write the implementation**

Create `apps/backend/src/agent-core/agent/state/nickname.ts`:

```ts
export const adjectives = [
  'amber',
  'azure',
  'brave',
  'bright',
  'calm',
  'clever',
  'crimson',
  'curious',
  'dapper',
  'eager',
  'fancy',
  'gentle',
  'glad',
  'golden',
  'happy',
  'hidden',
  'humble',
  'ivory',
  'jolly',
  'keen',
  'kind',
  'lively',
  'lucky',
  'mellow',
  'merry',
  'mighty',
  'nimble',
  'noble',
  'olive',
  'placid',
  'plucky',
  'proud',
  'quiet',
  'rapid',
  'rosy',
  'rustic',
  'scarlet',
  'shy',
  'silent',
  'silver',
  'sleek',
  'snug',
  'solar',
  'spry',
  'steady',
  'sunny',
  'swift',
  'teal',
  'tidy',
  'vivid',
  'warm',
  'witty',
];

export const nouns = [
  'otter',
  'harbor',
  'willow',
  'falcon',
  'meadow',
  'cedar',
  'pebble',
  'maple',
  'ember',
  'lantern',
  'comet',
  'badger',
  'cabin',
  'canyon',
  'cobweb',
  'cricket',
  'dawn',
  'delta',
  'ferry',
  'fjord',
  'glade',
  'grove',
  'heron',
  'island',
  'jetty',
  'kettle',
  'lark',
  'lily',
  'lynx',
  'marsh',
  'moss',
  'newt',
  'orchard',
  'panda',
  'parsnip',
  'pine',
  'quail',
  'reef',
  'ridge',
  'robin',
  'sable',
  'sparrow',
  'spruce',
  'thistle',
  'thorn',
  'tulip',
  'vale',
  'walnut',
  'wharf',
  'wren',
  'yarrow',
  'zephyr',
];

function pick(words: readonly string[]): string {
  return words[Math.floor(Math.random() * words.length)];
}

/**
 * Returns an `adjective-noun` handle not present in `taken`. Falls back to a
 * numeric suffix if the combination space is ever exhausted so the function
 * always terminates with a unique value.
 */
export function createNickname(taken: ReadonlySet<string>): string {
  for (let attempt = 0; attempt < 100; attempt++) {
    const candidate = `${pick(adjectives)}-${pick(nouns)}`;
    if (!taken.has(candidate)) return candidate;
  }

  let suffix = 2;
  let candidate = `${pick(adjectives)}-${pick(nouns)}-${suffix}`;
  while (taken.has(candidate)) {
    suffix += 1;
    candidate = `${pick(adjectives)}-${pick(nouns)}-${suffix}`;
  }
  return candidate;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun run test nickname`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/agent-core/agent/state/nickname.ts apps/backend/src/agent-core/agent/state/nickname.test.ts
git commit -m "feat(backend): add subagent nickname generator"
```

---

## Task 3: Registry stores and resolves nicknames

**Files:**

- Modify: `apps/backend/src/agent-core/agent/state/subagent-registry.ts`
- Test: `apps/backend/src/agent-core/agent/state/subagent-registry.test.ts`

- [ ] **Step 1: Write the failing tests**

Append these tests inside the existing top-level `describe('SubagentRegistry', ...)` block in `apps/backend/src/agent-core/agent/state/subagent-registry.test.ts` (use the file's existing `createMockAgent` helper and `SubAgentType` import):

```ts
it('assigns a generated nickname when none is provided', () => {
  const registry = new SubagentRegistry();
  const agent = createMockAgent();

  registry.register(agent, SubAgentType.GENERAL);

  const [record] = registry.list();
  expect(record.nickname).toMatch(/^[a-z]+-[a-z]+$/);
});

it('stores an explicit nickname and resolves it', () => {
  const registry = new SubagentRegistry();
  const agent = createMockAgent();

  registry.register(agent, SubAgentType.EXPLORE, 'crimson-otter');

  expect(registry.getByNickname('crimson-otter')).toEqual({
    agent,
    agentType: SubAgentType.EXPLORE,
    nickname: 'crimson-otter',
  });
});

it('returns undefined for an unknown nickname', () => {
  const registry = new SubagentRegistry();

  expect(registry.getByNickname('no-such-name')).toBeUndefined();
});

it('generates nicknames that avoid currently live ones', () => {
  const registry = new SubagentRegistry();
  registry.register(createMockAgent(), SubAgentType.GENERAL, 'crimson-otter');

  const fresh = registry.generateNickname();

  expect(fresh).not.toBe('crimson-otter');
  expect(fresh).toMatch(/^[a-z]+-[a-z]+$/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/backend && bun run test subagent-registry`
Expected: FAIL — `getByNickname`/`generateNickname` not functions; `nickname` missing on records.

- [ ] **Step 3: Implement registry changes**

In `apps/backend/src/agent-core/agent/state/subagent-registry.ts`:

a) Add the import after the existing imports (top of file):

```ts
import {createNickname} from './nickname.js';
```

b) Add `nickname` to `LiveSubagentRegistryEntry` (currently lines 13-17):

```ts
interface LiveSubagentRegistryEntry {
  readonly agent: Agent;
  readonly agentType: SubAgentType;
  readonly nickname: string;
  lastAccessOrder: number;
}
```

c) Add `nickname` to `LiveSubagentRecord` (currently lines 19-24):

```ts
export interface LiveSubagentRecord {
  readonly id: string;
  readonly agentType: SubAgentType;
  readonly title: string;
  readonly nickname: string;
  readonly isRunning: boolean;
}
```

d) Add `nickname` to `LiveSubagentHandle` (currently lines 26-29):

```ts
export interface LiveSubagentHandle {
  readonly agent: Agent;
  readonly agentType: SubAgentType;
  readonly nickname: string;
}
```

e) Replace `register` (currently lines 44-53) with a version accepting an optional nickname, and add `generateNickname`:

```ts
  register(agent: Agent, agentType: SubAgentType, nickname?: string): void {
    const id = subagentIdSchema.parse(agent.id);
    const parsedAgentType = subAgentTypeSchema.parse(agentType);
    const finalNickname = nickname ?? this.generateNickname();
    this.records.set(id, {
      agent,
      agentType: parsedAgentType,
      nickname: finalNickname,
      lastAccessOrder: this.nextAccessOrder(),
    });
    this.evictIfNeeded();
  }

  generateNickname(): string {
    const taken = new Set<string>();
    for (const entry of this.records.values()) {
      taken.add(entry.nickname);
    }
    return createNickname(taken);
  }
```

f) Update `get` (currently lines 55-66) to include `nickname` in the returned handle:

```ts
  get(id: string): LiveSubagentHandle | undefined {
    const parsedId = subagentIdSchema.safeParse(id);
    if (!parsedId.success) return undefined;

    const entry = this.records.get(parsedId.data);
    if (!entry) {
      return undefined;
    }

    entry.lastAccessOrder = this.nextAccessOrder();
    return {
      agent: entry.agent,
      agentType: entry.agentType,
      nickname: entry.nickname,
    };
  }

  getByNickname(nickname: string): LiveSubagentHandle | undefined {
    for (const entry of this.records.values()) {
      if (entry.nickname !== nickname) continue;
      entry.lastAccessOrder = this.nextAccessOrder();
      return {
        agent: entry.agent,
        agentType: entry.agentType,
        nickname: entry.nickname,
      };
    }
    return undefined;
  }
```

g) Update `list` (currently lines 68-75) to include `nickname`:

```ts
  list(): LiveSubagentRecord[] {
    return [...this.records.values()].map((entry) => ({
      id: entry.agent.id,
      agentType: entry.agentType,
      title: entry.agent.title,
      nickname: entry.nickname,
      isRunning: entry.agent.isRunning,
    }));
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/backend && bun run test subagent-registry`
Expected: PASS (existing tests + 4 new). Existing `get` assertions that compared `{agent, agentType}` now also see `nickname`; if any pre-existing test does a strict `toEqual` on the handle, update it to include `nickname: expect.any(String)`. (As of writing, the registry test asserts handles via the registry, not strict equality — confirm by running.)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/agent-core/agent/state/subagent-registry.ts apps/backend/src/agent-core/agent/state/subagent-registry.test.ts
git commit -m "feat(backend): store and resolve subagent nicknames in registry"
```

---

## Task 4: Turn runner threads nickname into the resume handle text

**Files:**

- Modify: `apps/backend/src/agent/tools/sub-agent/subagent-turn-runner.ts:15-31,122-132`

- [ ] **Step 1: Add `nickname` to the input interface**

Replace `RunSubagentTurnInput` (currently lines 20-31) so it carries the nickname:

```ts
export interface RunSubagentTurnInput {
  readonly context: ToolExecutionContext;
  readonly subagent: Agent;
  /** Readable handle echoed back so the caller can resume by name. */
  readonly nickname: string;
  readonly startEvent: SseSubagentDispatchEvent | SseSubagentResumeEvent;
  /**
   * Starts the subagent turn. Returns false when the subagent is busy and the
   * turn must be rejected. Dispatch always returns true; resume delegates to
   * the subagent's start-only-if-idle claim.
   */
  readonly startTurn: () => boolean;
  readonly onTurnStarted?: () => void;
}
```

- [ ] **Step 2: Destructure and use the nickname in the success content**

In `runSubagentTurn`, add `nickname` to the destructured argument list (currently lines 45-51):

```ts
export async function runSubagentTurn({
  context,
  subagent,
  nickname,
  startEvent,
  startTurn,
  onTurnStarted,
}: RunSubagentTurnInput): Promise<ToolExecuteResult<SubagentTurnResult>> {
```

Then replace the success-content block (currently lines 122-132) so the handle the LLM sees is the nickname:

```ts
if (completed) {
  const summary =
    lastReplyText ||
    'Subagent completed the task but produced no text summary.';
  const content = `<subagent_name>${nickname}</subagent_name>\n\n${summary}`;
  return {
    data: {summary, agentId: subagent.id},
    content,
    status: 'success',
  };
}
```

- [ ] **Step 3: Verify compilation expectation**

Run: `cd apps/backend && bun run test subagent-turn-runner 2>&1 | head -5 || true`
Expected: type errors at the dispatch/resume tool call sites (they don't pass `nickname` yet) — fixed in Tasks 5-6. The turn-runner file itself compiles.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/agent/tools/sub-agent/subagent-turn-runner.ts
git commit -m "feat(backend): echo subagent nickname as the resume handle"
```

---

## Task 5: Dispatch tool generates and registers the nickname

**Files:**

- Modify: `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts:48-58,99-105,198-220`
- Test: `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.test.ts`

- [ ] **Step 1: Update the failing tests**

In `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.test.ts`:

a) Replace the `registerSubAgent` registry test (currently lines 340-365) — it now expects a nickname on the record and passes one through:

```ts
it('registers the dispatched live subagent in the parent context registry', () => {
  const subagent = {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Live Subagent',
    sseLog: {activeReaderCount: 0},
  } as Agent;

  Object.defineProperty(subagent, 'isRunning', {
    get: () => false,
  });

  registerSubAgent(context, subagent, SubAgentType.EXPLORE, 'crimson-otter');

  expect(context.subagentRegistry.get(subagent.id)).toEqual({
    agent: subagent,
    agentType: SubAgentType.EXPLORE,
    nickname: 'crimson-otter',
  });
  expect(context.subagentRegistry.list()).toEqual([
    {
      id: subagent.id,
      agentType: SubAgentType.EXPLORE,
      title: 'Live Subagent',
      nickname: 'crimson-otter',
      isRunning: false,
    },
  ]);
});
```

b) In the `forwards dispatched subagent events...` test, the `runSubagentTurn` call (currently lines 381-400) must pass `nickname` and include it in `startEvent`, and the result content now uses the name. Replace the `runSubagentTurn({...})` call and the result assertion (lines 381-406):

```ts
const result = await runSubagentTurn({
  context: dispatchContext,
  subagent,
  nickname: 'crimson-otter',
  startEvent: {
    type: 'subagent-dispatch',
    agentId: subagent.id,
    nickname: 'crimson-otter',
    task: 'Inspect the code',
    agentType: SubAgentType.GENERAL,
    thinkingLevel: 'none',
    workingDirectory: tmpDir,
  },
  startTurn: () => {
    subagent.enqueueUserTurn('Inspect the code');
    return true;
  },
  onTurnStarted: () => {
    order.push('onTurnStarted');
    registerSubAgent(
      dispatchContext,
      subagent,
      SubAgentType.GENERAL,
      'crimson-otter',
    );
  },
});

expect(result).toMatchObject({
  status: 'success',
  data: {summary: 'done', agentId: subagent.id},
  content: `<subagent_name>crimson-otter</subagent_name>\n\ndone`,
});
```

c) In the `streams a resumed turn...` test, update its `runSubagentTurn` call (lines 431-446) to pass `nickname: 'crimson-otter'` and add `nickname: 'crimson-otter'` to the `startEvent`, and change the result content assertion (line 451) to:

```ts
      content: `<subagent_name>crimson-otter</subagent_name>\n\nnew summary`,
```

d) In the two remaining `runSubagentTurn` calls (the aborted-signal test ~lines 492-507 and the busy `startTurn: () => false` test ~lines 532-544), add `nickname: 'crimson-otter',` to the input object and `nickname: 'crimson-otter',` into each `startEvent`. (Their result assertions don't reference content, so no other change.)

e) Replace the description test (currently lines 200-202):

```ts
it('documents that the result includes the subagent name', () => {
  expect(dispatchAgentTool.description).toContain('includes the subagent name');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/backend && bun run test dispatch-agent-tool`
Expected: FAIL — `registerSubAgent` arity, missing `nickname`, description string mismatch.

- [ ] **Step 3: Implement the dispatch tool changes**

In `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts`:

a) Update the tool-description tail (currently lines 56-58) to reference the name:

```ts
'After the subagent returns, synthesize the subagent result for the user ' +
  'or use it to guide implementation. ' +
  'The result includes the subagent name so it can be sent follow-up work ' +
  'later without a separate lookup.';
```

b) Update `registerSubAgent` (currently lines 99-105) to accept and pass a nickname:

```ts
export function registerSubAgent(
  context: ToolExecutionContext,
  subagent: Agent,
  agentType: SubAgentType,
  nickname?: string,
): void {
  context.subagentRegistry.register(subagent, agentType, nickname);
}
```

c) In `execute`, after the subagent is created (currently the `runSubagentTurn` call at lines 198-220), generate the nickname before the turn and thread it through:

```ts
const nickname = context.subagentRegistry.generateNickname();

return runSubagentTurn({
  context,
  subagent,
  nickname,
  startEvent: {
    type: 'subagent-dispatch',
    agentId: subagent.id,
    nickname,
    task,
    agentType,
    thinkingLevel,
    workingDirectory,
  },
  // A freshly created subagent is never busy, so this always returns true.
  startTurn: () => {
    subagent.enqueueUserTurn(task);
    return true;
  },
  // Register after the turn starts so the registry does not briefly treat
  // a newly created subagent as idle on the normal dispatch path.
  onTurnStarted: () => {
    registerSubAgent(context, subagent, agentType, nickname);
  },
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/backend && bun run test dispatch-agent-tool`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.test.ts
git commit -m "feat(backend): dispatch subagents with a generated nickname"
```

---

## Task 6: Resume tool resolves by nickname

**Files:**

- Modify: `apps/backend/src/agent/tools/sub-agent/resume-agent-tool.ts`
- Test: `apps/backend/src/agent/tools/sub-agent/resume-agent-tool.test.ts`

- [ ] **Step 1: Update the failing tests**

In `apps/backend/src/agent/tools/sub-agent/resume-agent-tool.test.ts`:

a) Replace the description test (currently lines 86-88):

```ts
it('documents that the result includes the subagent name', () => {
  expect(resumeAgentTool.description).toContain('includes the subagent name');
});
```

b) Delete the malformed-id test (currently lines 96-109) — there is no UUID surface anymore.

c) Replace the unknown-id test (currently lines 111-120):

```ts
it('returns a normal failure for unknown names', async () => {
  const context = createMockContext();
  const result = await resumeAgentTool.execute(
    {name: 'no-such-name', task: 'Continue'},
    context,
  );

  expect(result.status).toBe('failure');
  expect(result.content).toContain('not available to resume');
});
```

d) Replace the busy test (currently lines 122-134) to register with a known nickname and resume by it:

```ts
it('returns a busy failure for running subagents', async () => {
  const context = createMockContext();
  const subagent = createMockSubagent({isRunning: true});
  context.subagentRegistry.register(
    subagent,
    SubAgentType.GENERAL,
    'crimson-otter',
  );

  const result = await resumeAgentTool.execute(
    {name: 'crimson-otter', task: 'Continue'},
    context,
  );

  expect(result.status).toBe('failure');
  expect(result.content).toContain('already running');
});
```

e) Replace the idle follow-up test (currently lines 136-166):

```ts
it('runs a follow-up turn on a registered idle subagent', async () => {
  const context = createContextWithEvents();
  const subagent = createMockSubagent({output: 'follow-up result'});
  context.subagentRegistry.register(
    subagent,
    SubAgentType.EXPLORE,
    'crimson-otter',
  );

  const result = await resumeAgentTool.execute(
    {name: 'crimson-otter', task: 'Continue analysis'},
    context,
  );

  expect(result).toMatchObject({
    status: 'success',
    data: {summary: 'follow-up result', agentId: subagent.id},
    content: `<subagent_name>crimson-otter</subagent_name>\n\nfollow-up result`,
  });
  expect(subagent.handledMessages).toEqual(['Continue analysis']);
  expect(context.events).toEqual([
    {
      type: 'subagent-resume',
      agentId: subagent.id,
      nickname: 'crimson-otter',
      task: 'Continue analysis',
      agentType: SubAgentType.EXPLORE,
      thinkingLevel: 'none',
      workingDirectory: '/workspace/project',
    },
    expect.objectContaining({type: 'subagent-output'}),
    expect.objectContaining({type: 'subagent-output'}),
    expect.objectContaining({type: 'subagent-output'}),
    {type: 'subagent-complete', agentId: subagent.id, status: 'success'},
  ]);
});
```

f) In the concurrency test (currently lines 168-229), register with a nickname and resume by it. Replace the `register` call (line 210) with:

```ts
context.subagentRegistry.register(
  subagent,
  SubAgentType.GENERAL,
  'crimson-otter',
);
```

and replace the two `resumeAgentTool.execute({agentId: subagent.id, ...})` calls (lines 212-215 and 218-221) with `{name: 'crimson-otter', task: 'First'}` and `{name: 'crimson-otter', task: 'Second'}` respectively.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/backend && bun run test resume-agent-tool`
Expected: FAIL — `name` not accepted, `getByNickname` not used, content mismatch.

- [ ] **Step 3: Implement the resume tool**

Replace the body of `apps/backend/src/agent/tools/sub-agent/resume-agent-tool.ts` with:

```ts
import {z} from 'zod';

import type {
  ToolDefinition,
  ToolExecuteFailureResult,
  ToolExecuteResult,
  ToolExecutionContext,
} from '@/agent-core/tool/index.js';

import {
  runSubagentTurn,
  type SubagentTurnResult,
} from './subagent-turn-runner.js';

const parameters = z.object({
  name: z
    .string()
    .min(1)
    .describe(
      'Name of the subagent to resume, as returned when it was dispatched. ' +
        'Use this to send a previously dispatched subagent more work.',
    ),
  task: z.string().min(1).describe('Follow-up task for the subagent.'),
});

function failure(message: string): ToolExecuteFailureResult {
  return {data: {message}, content: message, status: 'failure'};
}

/** Tool that resumes an idle live subagent with a follow-up task. */
export const resumeAgentTool: ToolDefinition<
  typeof parameters,
  SubagentTurnResult
> = {
  name: 'resume_agent',
  displayName: 'Resume Agent',
  description:
    'Resumes a subagent by sending it a follow-up task. ' +
    'The result includes the subagent name so it can be sent further work ' +
    'later without a separate lookup.',
  parameters,
  suppressToolEvents: true,
  compactResult({content}) {
    return content.trim() || null;
  },
  async execute(
    args: z.infer<typeof parameters>,
    context: ToolExecutionContext,
  ): Promise<ToolExecuteResult<SubagentTurnResult>> {
    const handle = context.subagentRegistry.getByNickname(args.name);
    if (!handle) {
      return failure(
        `Subagent "${args.name}" is not available to resume. ` +
          'Dispatch a new subagent if needed.',
      );
    }

    return runSubagentTurn({
      context,
      subagent: handle.agent,
      nickname: handle.nickname,
      startEvent: {
        type: 'subagent-resume',
        agentId: handle.agent.id,
        nickname: handle.nickname,
        task: args.task,
        agentType: handle.agentType,
        thinkingLevel: handle.agent.getThinkingLevel(),
        workingDirectory: handle.agent.getWorkingDirectory(),
      },
      startTurn: () => handle.agent.tryStartUserTurn(args.task),
    });
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/backend && bun run test resume-agent-tool`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/agent/tools/sub-agent/resume-agent-tool.ts apps/backend/src/agent/tools/sub-agent/resume-agent-tool.test.ts
git commit -m "feat(backend): resume subagents by nickname"
```

---

## Task 7: List tool prints nicknames

**Files:**

- Modify: `apps/backend/src/agent/tools/sub-agent/list-resumable-agents-tool.ts:10-36`
- Test: `apps/backend/src/agent/tools/sub-agent/list-resumable-agents-tool.test.ts`

- [ ] **Step 1: Update the failing tests**

In `apps/backend/src/agent/tools/sub-agent/list-resumable-agents-tool.test.ts`, replace the `lists resumable subagents from the registry` test (currently lines 80-116):

```ts
it('lists resumable subagents from the registry', async () => {
  const general = createMockAgent({title: 'Build Summary'});
  const explore = createMockAgent({
    title: 'Explore Report',
    isRunning: true,
  });
  context.subagentRegistry.register(
    general,
    SubAgentType.GENERAL,
    'crimson-otter',
  );
  context.subagentRegistry.register(
    explore,
    SubAgentType.EXPLORE,
    'silver-wren',
  );

  const result = await listResumableAgentsTool.execute({}, context);

  expect(result).toMatchObject({
    status: 'success',
    data: {
      agents: [
        {
          id: general.id,
          agentType: SubAgentType.GENERAL,
          title: 'Build Summary',
          nickname: 'crimson-otter',
          isRunning: false,
        },
        {
          id: explore.id,
          agentType: SubAgentType.EXPLORE,
          title: 'Explore Report',
          nickname: 'silver-wren',
          isRunning: true,
        },
      ],
    },
  });
  expect(result.content).toContain('crimson-otter');
  expect(result.content).toContain('Build Summary');
  expect(result.content).toContain('idle');
  expect(result.content).toContain('silver-wren');
  expect(result.content).toContain('Explore Report');
  expect(result.content).toContain('running');
});
```

Also update the `does not read persisted metadata or snapshots` test (currently lines 118-141): change its `register` call to `context.subagentRegistry.register(agent, SubAgentType.GENERAL, 'crimson-otter');` and add `nickname: 'crimson-otter',` to the expected agent object.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/backend && bun run test list-resumable-agents`
Expected: FAIL — `nickname` missing from data, content lacks the name.

- [ ] **Step 3: Implement the list tool changes**

In `apps/backend/src/agent/tools/sub-agent/list-resumable-agents-tool.ts`:

a) Add `nickname` to `ListedResumableAgent` (currently lines 10-15):

```ts
interface ListedResumableAgent {
  id: string;
  agentType: SubAgentType;
  title: string;
  nickname: string;
  isRunning: boolean;
}
```

b) Replace the formatter (currently lines 23-36) to print the name instead of the id:

```ts
function formatListResumableAgentsContent(
  agents: readonly ListedResumableAgent[],
): string {
  if (agents.length === 0) {
    return 'No subagents are available to resume.';
  }

  return agents
    .map((agent) => {
      const status = agent.isRunning ? 'running' : 'idle';
      return `- ${agent.title} (${agent.agentType}, ${status})\n  name: ${agent.nickname}`;
    })
    .join('\n');
}
```

The `execute` method already spreads `context.subagentRegistry.list()` into `data.agents`; since `list()` now includes `nickname`, the `ListedResumableAgent` shape matches with no further change there.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/backend && bun run test list-resumable-agents`
Expected: PASS.

- [ ] **Step 5: Run the full backend suite + typecheck**

Run: `cd apps/backend && bun run test && bun run typecheck`
Expected: all PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/agent/tools/sub-agent/list-resumable-agents-tool.ts apps/backend/src/agent/tools/sub-agent/list-resumable-agents-tool.test.ts
git commit -m "feat(backend): list resumable subagents by nickname"
```

---

## Task 8: Frontend threads the nickname from SSE to message state

**Files:**

- Modify: `apps/frontend/src/modules/chat-session/hooks/useStreamChat.ts:129-144`
- Modify: `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/types.ts:39-49,114-123`
- Modify: `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/hooks/useMessages.ts:222-260`

- [ ] **Step 1: Add `nickname` to the frontend types**

In `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/types.ts`:

a) Add `nickname` to `SubagentContent` (currently lines 39-49):

```ts
export interface SubagentContent {
  type: 'subagent';
  mode: SubagentMode;
  agentId: string;
  nickname?: string;
  task: string;
  agentType: string;
  thinkingLevel: ThinkingLevel;
  workingDirectory: string;
  status: 'running' | 'complete' | 'error';
  eventBus: ChatEventBus;
}
```

b) Add `nickname` to the `subagent-dispatched` event (currently lines 114-123):

```ts
  /** A subagent turn started. */
  'subagent-dispatched': {
    mode: SubagentMode;
    agentId: string;
    nickname?: string;
    task: string;
    agentType: string;
    thinkingLevel: ThinkingLevel;
    workingDirectory: string;
    eventBus: ChatEventBus;
  };
```

- [ ] **Step 2: Pass `nickname` from the SSE bridge**

In `apps/frontend/src/modules/chat-session/hooks/useStreamChat.ts`, in the `subagent-dispatch`/`subagent-resume` case, add `nickname` to the emitted payload (currently lines 133-142):

```ts
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
```

- [ ] **Step 3: Thread `nickname` into the message content**

In `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/hooks/useMessages.ts`, update `pushSubagentStart`'s parameter type and the constructed content (currently lines 222-252):

In the `data` parameter object type (after `agentId: string;`), add:

```ts
    nickname?: string;
```

In the constructed `content` object (after `agentId: data.agentId,`), add:

```ts
        nickname: data.nickname,
```

- [ ] **Step 4: Typecheck the frontend**

Run: `cd apps/frontend && bunx tsc -b --noEmit 2>/dev/null || bunx tsc -b`
Expected: no type errors (the disclosure view still ignores `nickname` until Task 9, which is fine — the prop is optional).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/modules/chat-session/hooks/useStreamChat.ts apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/types.ts apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/hooks/useMessages.ts
git commit -m "feat(frontend): thread subagent nickname through chat state"
```

---

## Task 9: Disclosure shows the nickname

**Files:**

- Modify: `apps/frontend/.../SubagentDisclosure/SubagentDisclosure.tsx`
- Modify: `apps/frontend/.../SubagentDisclosure/SubagentDisclosureView.tsx`
- Modify: `apps/frontend/.../MessageList/components/RenderItem/RenderItem.tsx:122-131`
- Test: `apps/frontend/.../SubagentDisclosure/SubagentDisclosureView.test.tsx`

Paths below are under `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/`.

- [ ] **Step 1: Update the failing tests**

Replace both tests in `SubagentDisclosure/SubagentDisclosureView.test.tsx` (currently lines 60-110):

```ts
describe('SubagentDisclosureView', () => {
  it('renders dispatch mode and the subagent name', () => {
    render(
      <SubagentDisclosureView
        mode='dispatch'
        agentId='agent-dispatch-1'
        nickname='crimson-otter'
        task='Search config files'
        agentType='general'
        thinkingLevel='none'
        workingDirectory='/tmp/project'
        status='running'
        eventBus={eventBus}
        scrollRef={scrollRef}
      />,
    );

    const trigger = screen.getByRole('button', {name: /Search config files/});
    expect(within(trigger).getByText('Dispatch')).toBeInTheDocument();

    fireEvent.click(trigger);

    expect(screen.getByText('Subagent')).toBeInTheDocument();
    expect(screen.getByText('crimson-otter')).toBeInTheDocument();
  });

  it('renders resume mode and the resumed subagent name', () => {
    render(
      <SubagentDisclosureView
        mode='resume'
        agentId='agent-resume-1'
        nickname='silver-wren'
        task='Continue config search'
        agentType='general'
        thinkingLevel='none'
        workingDirectory='/tmp/project'
        status='complete'
        eventBus={eventBus}
        scrollRef={scrollRef}
      />,
    );

    const trigger = screen.getByRole('button', {
      name: /Continue config search/,
    });
    expect(within(trigger).getByText('Resume')).toBeInTheDocument();

    fireEvent.click(trigger);

    expect(screen.getByText('Resumed subagent')).toBeInTheDocument();
    expect(screen.getByText('silver-wren')).toBeInTheDocument();
  });

  it('falls back to the agent id when no nickname is present', () => {
    render(
      <SubagentDisclosureView
        mode='dispatch'
        agentId='agent-dispatch-legacy'
        task='Legacy replay'
        agentType='general'
        thinkingLevel='none'
        workingDirectory='/tmp/project'
        status='complete'
        eventBus={eventBus}
        scrollRef={scrollRef}
      />,
    );

    fireEvent.click(screen.getByRole('button', {name: /Legacy replay/}));

    expect(screen.getByText('agent-dispatch-legacy')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/frontend && bun run test SubagentDisclosureView`
Expected: FAIL — `nickname` not a prop; label text still "Subagent ID".

- [ ] **Step 3: Implement the view changes**

In `SubagentDisclosure/SubagentDisclosureView.tsx`:

a) Add `nickname?: string;` to `SubagentDisclosureViewProps` (after `agentId: string;`, currently line 14).

b) Add `nickname,` to the destructured props (after `agentId,`, currently line 38).

c) Replace the label map (currently lines 31-34) so it no longer says "ID":

```ts
const AGENT_NAME_LABELS = {
  dispatch: 'Subagent',
  resume: 'Resumed subagent',
} satisfies Record<SubagentMode, string>;
```

d) Replace the id row (currently lines 82-85) to use the new label and the nickname with UUID fallback:

```tsx
<div className={styles.agentIdRow}>
  <span className={styles.label}>{AGENT_NAME_LABELS[mode]}</span>
  <span className={styles.agentId}>{nickname ?? agentId}</span>
</div>
```

- [ ] **Step 4: Pass `nickname` through the container and RenderItem**

a) In `SubagentDisclosure/SubagentDisclosure.tsx`: add `nickname?: string;` to `SubagentDisclosureProps` (after `agentId: string;`), add `nickname,` to the destructured params, and add `nickname={nickname}` to the `<SubagentDisclosureView ... />` props.

b) In `RenderItem/RenderItem.tsx`, add `nickname` to the `<SubagentDisclosure>` props in the `'subagent'` case (currently lines 122-131), after `agentId={item.agentId}`:

```tsx
            nickname={item.nickname}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/frontend && bun run test SubagentDisclosureView`
Expected: PASS (3 tests).

- [ ] **Step 6: Run the full frontend suite + build typecheck**

Run: `cd apps/frontend && bun run test && bunx tsc -b`
Expected: all PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/SubagentDisclosure apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/RenderItem/RenderItem.tsx
git commit -m "feat(frontend): show subagent nickname in disclosure"
```

---

## Task 10: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Backend suite, lint, typecheck**

Run: `cd apps/backend && bun run test && bun run lint && bun run typecheck`
Expected: all PASS.

- [ ] **Step 2: Frontend suite, lint, build**

Run: `cd apps/frontend && bun run test && bun run lint && bunx tsc -b`
Expected: all PASS.

- [ ] **Step 3: Manual UI check (per CLAUDE.md dev-server verification)**

Run the app from the repo root (`bun dev`), dispatch a subagent in the chat, and confirm the disclosure shows a readable name (e.g. `crimson-otter`) instead of a UUID, in both light and dark themes. Confirm resuming refers to the subagent by that name.

- [ ] **Step 4: Final commit (if any lint/format adjustments)**

```bash
git add -A
git commit -m "chore: subagent nickname verification fixups" || echo "nothing to commit"
```

---

## Self-Review Notes

- **Spec coverage:** generator (Task 2), in-memory registry ownership + `getByNickname` + collision avoidance (Task 3), generate-early/register-at-existing-point (Tasks 4-5), resume-by-name (Task 6), list-by-name (Task 7), SSE optional field for back-compat (Task 1), frontend `nickname ?? agentId` fallback + label change (Tasks 8-9). All spec sections map to a task.
- **UUID stays internal:** registry `Map` key, SSE `agentId` routing, and disk dirs are untouched; only the LLM-facing content/params/list switch to the nickname, and the frontend display switches to the nickname.
- **Type consistency:** `createNickname(taken)` (pure) vs `registry.generateNickname()` (instance) are intentionally distinct names. `register(agent, agentType, nickname?)`, `getByNickname(name)`, and `LiveSubagentHandle.nickname` are used consistently across Tasks 3-7. Success content tag is `<subagent_name>` everywhere (Tasks 4-6).
- **Back-compat:** SSE `nickname` is optional so already-persisted `sse-events.jsonl` events still validate; the view falls back to the UUID when `nickname` is absent.
