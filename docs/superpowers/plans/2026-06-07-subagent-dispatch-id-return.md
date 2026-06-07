# Return Subagent ID from dispatch_agent and resume_agent — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the subagent id to the main agent (the LLM) in the success result of both `dispatch_agent` and `resume_agent`, so a subagent can be resumed without a separate lookup.

**Architecture:** Both tools share the `runSubagentTurn` helper. The success branch there will add `agentId` to the structured `SubagentTurnResult` and wrap the returned `content` with a `<subagent_id>…</subagent_id>` header above the summary. Failure/abort/error paths are untouched. Tool descriptions get one generic sentence each.

**Tech Stack:** TypeScript (NodeNext ESM), Bun (package manager/runtime), Vitest, ESLint, Prettier.

**Spec:** `docs/superpowers/specs/2026-06-07-subagent-dispatch-id-return-design.md`

---

## File Structure

- Modify: `apps/backend/src/agent/tools/sub-agent/subagent-turn-runner.ts`
  - `SubagentTurnResult` gains `agentId`; success branch wraps `content` and returns `agentId`.
- Modify: `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts`
  - Append one generic sentence to the tool description.
- Modify: `apps/backend/src/agent/tools/sub-agent/resume-agent-tool.ts`
  - Append one generic sentence to the tool description.
- Test: `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.test.ts`
  - Update two success assertions; add a description assertion.
- Test: `apps/backend/src/agent/tools/sub-agent/resume-agent-tool.test.ts`
  - Update one success assertion; add a description assertion.

Both mock subagents in these tests use the id `11111111-1111-4111-8111-111111111111`.

---

## Task 1: Surface `agentId` in the shared `runSubagentTurn` result

**Files:**

- Modify: `apps/backend/src/agent/tools/sub-agent/subagent-turn-runner.ts:15-17` (interface) and `:108-113` (success branch)
- Test: `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.test.ts:442-446` and `:485-489`
- Test: `apps/backend/src/agent/tools/sub-agent/resume-agent-tool.test.ts:145-149`

Both test files exercise `runSubagentTurn`, so both must be updated before the implementation lands or the suite goes red.

- [ ] **Step 1: Update the failing success assertions**

In `dispatch-agent-tool.test.ts`, replace the assertion in the test `forwards dispatched subagent events and registers after the turn starts` (currently):

```ts
expect(result).toMatchObject({
  status: 'success',
  data: {summary: 'done'},
  content: 'done',
});
```

with:

```ts
expect(result).toMatchObject({
  status: 'success',
  data: {summary: 'done', agentId: subagent.id},
  content: `<subagent_id>${subagent.id}</subagent_id>\n\ndone`,
});
```

In the same file, replace the assertion in the test `streams a resumed turn from the current subagent log end` (currently):

```ts
expect(result).toMatchObject({
  status: 'success',
  data: {summary: 'new summary'},
  content: 'new summary',
});
```

with:

```ts
expect(result).toMatchObject({
  status: 'success',
  data: {summary: 'new summary', agentId: subagent.id},
  content: `<subagent_id>${subagent.id}</subagent_id>\n\nnew summary`,
});
```

In `resume-agent-tool.test.ts`, replace the assertion in the test `runs a follow-up turn on a registered idle subagent` (currently):

```ts
expect(result).toMatchObject({
  status: 'success',
  data: {summary: 'follow-up result'},
  content: 'follow-up result',
});
```

with:

```ts
expect(result).toMatchObject({
  status: 'success',
  data: {summary: 'follow-up result', agentId: subagent.id},
  content: `<subagent_id>${subagent.id}</subagent_id>\n\nfollow-up result`,
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/backend && bun run test src/agent/tools/sub-agent`
Expected: FAIL — the three updated assertions report a `content`/`data` mismatch (received plain summary, expected the `<subagent_id>` wrapper and `agentId`).

- [ ] **Step 3: Add `agentId` to `SubagentTurnResult`**

In `subagent-turn-runner.ts`, change the interface (currently):

```ts
export interface SubagentTurnResult {
  summary: string;
}
```

to:

```ts
export interface SubagentTurnResult {
  summary: string;
  agentId: string;
}
```

- [ ] **Step 4: Wrap the success content and return `agentId`**

In `subagent-turn-runner.ts`, change the success branch (currently):

```ts
if (completed) {
  const summary =
    lastReplyText ||
    'Subagent completed the task but produced no text summary.';
  return {data: {summary}, content: summary, status: 'success'};
}
```

to:

```ts
if (completed) {
  const summary =
    lastReplyText ||
    'Subagent completed the task but produced no text summary.';
  const content = `<subagent_id>${subagent.id}</subagent_id>\n\n${summary}`;
  return {
    data: {summary, agentId: subagent.id},
    content,
    status: 'success',
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/backend && bun run test src/agent/tools/sub-agent`
Expected: PASS — all dispatch and resume sub-agent tests green.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/agent/tools/sub-agent/subagent-turn-runner.ts \
  apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.test.ts \
  apps/backend/src/agent/tools/sub-agent/resume-agent-tool.test.ts
git commit -m "feat(backend): return subagent id from dispatch and resume results

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 2: Document the returned id in the tool descriptions

**Files:**

- Modify: `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts:48-63` (`buildToolDescription` header)
- Modify: `apps/backend/src/agent/tools/sub-agent/resume-agent-tool.ts:52` (`description`)
- Test: `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.test.ts`
- Test: `apps/backend/src/agent/tools/sub-agent/resume-agent-tool.test.ts`

Wording stays generic and must not name other tools, per `apps/backend/src/agent/tools/CLAUDE.md`. The phrase "subagent id" avoids an apostrophe so it fits the single-quoted string concatenation already used in these files.

- [ ] **Step 1: Add failing description assertions**

In `dispatch-agent-tool.test.ts`, add this test inside the `describe('dispatchAgentTool', …)` block, right after the existing `it('documents when dispatching a subagent is useful', …)` test:

```ts
it('documents that the result includes the subagent id', () => {
  expect(dispatchAgentTool.description).toContain('includes the subagent id');
});
```

In `resume-agent-tool.test.ts`, add this test inside the `describe('resumeAgentTool', …)` block, right after the existing `it('has the correct name', …)` test:

```ts
it('documents that the result includes the subagent id', () => {
  expect(resumeAgentTool.description).toContain('includes the subagent id');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/backend && bun run test src/agent/tools/sub-agent`
Expected: FAIL — both new tests fail because the descriptions do not yet contain `includes the subagent id`.

- [ ] **Step 3: Update the `dispatch_agent` description**

In `dispatch-agent-tool.ts`, change the end of the `header` string in `buildToolDescription` (currently):

```ts
'After the subagent returns, synthesize the subagent result for the user ' +
  'or use it to guide implementation.';
```

to:

```ts
'After the subagent returns, synthesize the subagent result for the user ' +
  'or use it to guide implementation. ' +
  'The result includes the subagent id so it can be sent follow-up work ' +
  'later without a separate lookup.';
```

- [ ] **Step 4: Update the `resume_agent` description**

In `resume-agent-tool.ts`, change the `description` field (currently):

```ts
  description: 'Resumes a subagent by sending it a follow-up task.',
```

to:

```ts
  description:
    'Resumes a subagent by sending it a follow-up task. ' +
    'The result includes the subagent id so it can be sent further work ' +
    'later without a separate lookup.',
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/backend && bun run test src/agent/tools/sub-agent`
Expected: PASS — all sub-agent tests, including the two new description tests, are green.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts \
  apps/backend/src/agent/tools/sub-agent/resume-agent-tool.ts \
  apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.test.ts \
  apps/backend/src/agent/tools/sub-agent/resume-agent-tool.test.ts
git commit -m "feat(backend): note returned subagent id in dispatch and resume descriptions

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 3: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Typecheck the backend**

Run: `cd apps/backend && bun run typecheck`
Expected: PASS — no type errors (confirms `SubagentTurnResult` consumers still compile).

- [ ] **Step 2: Lint the backend**

Run: `cd apps/backend && bun run lint`
Expected: PASS — no ESLint errors.

- [ ] **Step 3: Run the full backend test suite**

Run: `cd apps/backend && bun run test`
Expected: PASS — entire backend suite green, confirming no other consumer relied on the old plain-summary `content`.

- [ ] **Step 4: Confirm there is nothing left to commit**

Run: `git status --short`
Expected: empty output (Task 1 and Task 2 already committed all changes; any formatting from the pre-commit hook is already included).
