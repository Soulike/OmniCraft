# Subagent Parameters & Usage Display — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display subagent dispatch parameters (type, thinking level, working directory) and usage statistics (model, tokens) in the SubagentDisclosure UI.

**Architecture:** Extend the `subagent-dispatch` SSE event with new fields, propagate them through the frontend event chain to the SubagentDisclosure component. Extract the existing UsageInfo component to a shared location for reuse. Add a params footer inside the disclosure card and a usage row outside it.

**Tech Stack:** Zod schemas, React, CSS Modules, HeroUI Disclosure

**Spec:** `docs/superpowers/specs/2026-04-13-subagent-params-usage-design.md`

---

### Task 1: Extend `subagent-dispatch` SSE event schema

**Files:**

- Modify: `packages/sse-events/package.json`
- Modify: `packages/sse-events/src/schema.ts:122-127`

- [ ] **Step 1: Add `@omnicraft/api-schema` dependency**

```bash
cd packages/sse-events && bun add @omnicraft/api-schema@workspace:^
```

- [ ] **Step 2: Add new fields to the schema**

In `packages/sse-events/src/schema.ts`, add import and extend the schema:

```typescript
import {thinkingLevelSchema} from '@omnicraft/api-schema';
```

Replace the existing `sseSubagentDispatchEventSchema`:

```typescript
export const sseSubagentDispatchEventSchema = z.object({
  type: z.literal('subagent-dispatch'),
  agentId: z.string(),
  task: z.string(),
  agentType: z.string(),
  thinkingLevel: thinkingLevelSchema,
  workingDirectory: z.string(),
});
```

- [ ] **Step 3: Run typecheck**

```bash
cd packages/sse-events && bun run typecheck
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/sse-events/package.json packages/sse-events/src/schema.ts
git commit -m "feat(sse-events): add agentType, thinkingLevel, workingDirectory to subagent-dispatch"
```

---

### Task 2: Update backend to emit new fields

**Files:**

- Modify: `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts:168-172`

- [ ] **Step 1: Include new fields in the emitted event**

In `dispatch-agent-tool.ts`, update the `subagent-dispatch` emit (around line 168):

```typescript
context.onSubAgentEvent({
  type: 'subagent-dispatch',
  agentId: subagent.id,
  task,
  agentType,
  thinkingLevel,
  workingDirectory,
});
```

The destructured variables `agentType`, `thinkingLevel`, and `workingDirectory` are already available from `args` (line 99-104).

- [ ] **Step 2: Run typecheck**

```bash
cd apps/backend && bun run typecheck
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts
git commit -m "feat(backend): emit agentType, thinkingLevel, workingDirectory in subagent-dispatch"
```

---

### Task 3: Delete unused duplicate `useUsage` hook

**Files:**

- Delete: `apps/frontend/src/pages/chat/hooks/useUsage.ts`

- [ ] **Step 1: Verify it's unused**

```bash
cd apps/frontend && grep -r "chat/hooks/useUsage" src/ --include="*.ts" --include="*.tsx"
```

Expected: Only the file itself shows up, no imports.

- [ ] **Step 2: Delete the file**

```bash
rm apps/frontend/src/pages/chat/hooks/useUsage.ts
```

- [ ] **Step 3: Run typecheck to confirm nothing breaks**

```bash
cd apps/frontend && bun run typecheck
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add -u apps/frontend/src/pages/chat/hooks/useUsage.ts
git commit -m "refactor(frontend): delete unused duplicate useUsage hook"
```

---

### Task 4: Extract `UsageInfo` to shared location and refactor `useUsage`

**Files:**

- Move: `apps/frontend/src/pages/chat/components/InfoBar/components/UsageInfo/` → `apps/frontend/src/pages/chat/components/UsageInfo/`
- Modify: `apps/frontend/src/pages/chat/components/UsageInfo/hooks/useUsage.ts` (accept `eventBus` param)
- Modify: `apps/frontend/src/pages/chat/components/InfoBar/InfoBar.tsx` (update imports)
- Modify: `apps/frontend/src/pages/chat/components/InfoBar/InfoBarView.tsx` (update imports)

- [ ] **Step 1: Move the UsageInfo directory**

```bash
mv apps/frontend/src/pages/chat/components/InfoBar/components/UsageInfo apps/frontend/src/pages/chat/components/UsageInfo
```

- [ ] **Step 2: Refactor `useUsage` to accept `eventBus` parameter**

In `apps/frontend/src/pages/chat/components/UsageInfo/hooks/useUsage.ts`:

```typescript
import type {SseUsage} from '@omnicraft/sse-events';
import {useEffect, useState} from 'react';

import type {ChatEventBus} from '../../StreamingMessageDisplay/index.js';

/** Tracks token usage from done events on the given event bus. */
export function useUsage(eventBus: ChatEventBus) {
  const [usage, setUsage] = useState<SseUsage | null>(null);

  useEffect(() => {
    const handler = (data: {usage: SseUsage}) => {
      setUsage(data.usage);
    };
    eventBus.on('done', handler);
    return () => {
      eventBus.off('done', handler);
    };
  }, [eventBus]);

  return {usage};
}
```

- [ ] **Step 3: Update `UsageInfo/index.ts` to also export `useUsage`**

```typescript
export {UsageInfo} from './UsageInfo.js';
export {useUsage} from './hooks/useUsage.js';
```

- [ ] **Step 4: Update `InfoBar.tsx` imports**

In `apps/frontend/src/pages/chat/components/InfoBar/InfoBar.tsx`:

```typescript
import {useChatEventBus} from '../../hooks/useChatEventBus.js';
import {useSessionConfig} from '../../hooks/useSessionConfig.js';
import {useUsage} from '../UsageInfo/index.js';
import {InfoBarView} from './InfoBarView.js';

export function InfoBar() {
  const {selectedWorkspace, selectedExtraAllowedPathEntries} =
    useSessionConfig();
  const eventBus = useChatEventBus();
  const {usage} = useUsage(eventBus);

  return (
    <InfoBarView
      selectedWorkspace={selectedWorkspace}
      selectedExtraAllowedPathEntries={selectedExtraAllowedPathEntries}
      usage={usage}
    />
  );
}
```

- [ ] **Step 5: Update `InfoBarView.tsx` import for `UsageInfo`**

In `apps/frontend/src/pages/chat/components/InfoBar/InfoBarView.tsx`, update the import:

```typescript
import {UsageInfo} from '../UsageInfo/index.js';
```

(Replace `import {UsageInfo} from './components/UsageInfo/index.js';`)

- [ ] **Step 6: Run typecheck**

```bash
cd apps/frontend && bun run typecheck
```

Expected: PASS

- [ ] **Step 7: Run existing tests**

```bash
cd apps/frontend && bun run test
```

Expected: PASS (format-token-count tests still pass from new location)

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/pages/chat/components/
git commit -m "refactor(frontend): extract UsageInfo to shared location, useUsage accepts eventBus param"
```

---

### Task 5: Propagate new fields through frontend event chain

**Files:**

- Modify: `apps/frontend/src/pages/chat/components/StreamingMessageDisplay/types.ts:29-35,91-97`
- Modify: `apps/frontend/src/pages/chat/hooks/useStreamChat.ts:85-93`
- Modify: `apps/frontend/src/pages/chat/components/StreamingMessageDisplay/hooks/useMessages.ts:190-216,284-289`
- Modify: `apps/frontend/src/pages/chat/components/StreamingMessageDisplay/components/MessageList/hooks/useMessageList.ts:69-75,176-185`

- [ ] **Step 1: Add fields to `SubagentContent` and `ChatEventMap`**

In `apps/frontend/src/pages/chat/components/StreamingMessageDisplay/types.ts`:

Add import:

```typescript
import type {ThinkingLevel} from '@omnicraft/api-schema';
```

Update `SubagentContent`:

```typescript
export interface SubagentContent {
  type: 'subagent';
  agentId: string;
  task: string;
  agentType: string;
  thinkingLevel: ThinkingLevel;
  workingDirectory: string;
  status: 'running' | 'complete' | 'error';
  eventBus: ChatEventBus;
}
```

Update `subagent-dispatched` in `ChatEventMap`:

```typescript
'subagent-dispatched': {
  agentId: string;
  task: string;
  agentType: string;
  thinkingLevel: ThinkingLevel;
  workingDirectory: string;
  eventBus: ChatEventBus;
};
```

- [ ] **Step 2: Pass new fields in `useStreamChat.ts`**

In `apps/frontend/src/pages/chat/hooks/useStreamChat.ts`, update the `subagent-dispatch` case (around line 85-93):

```typescript
case 'subagent-dispatch': {
  const bus = new EventBus<ChatEventMap>();
  subagentBusMapRef.current.set(event.agentId, bus);
  eventBus.emit('subagent-dispatched', {
    agentId: event.agentId,
    task: event.task,
    agentType: event.agentType,
    thinkingLevel: event.thinkingLevel,
    workingDirectory: event.workingDirectory,
    eventBus: bus,
  });
  break;
}
```

- [ ] **Step 3: Pass new fields in `useMessages.ts`**

In `pushSubagentStart`, the `data` parameter already contains all fields from the bus event. Update the content object to include the new fields:

```typescript
function pushSubagentStart(
  prev: ChatMessage[],
  data: {
    agentId: string;
    task: string;
    agentType: string;
    thinkingLevel: ThinkingLevel;
    workingDirectory: string;
    eventBus: ChatEventBus;
  },
): ChatMessage[] {
  const base = removeTrailingAssistantMessageIfEmpty(prev);
  return [
    ...base,
    {
      id: null,
      createdAt: null,
      role: 'assistant' as const,
      content: {
        type: 'subagent' as const,
        agentId: data.agentId,
        task: data.task,
        agentType: data.agentType,
        thinkingLevel: data.thinkingLevel,
        workingDirectory: data.workingDirectory,
        status: 'running' as const,
        eventBus: data.eventBus,
      },
    },
    {
      id: null,
      createdAt: null,
      role: 'assistant' as const,
      content: {type: 'text' as const, content: ''},
    },
  ];
}
```

Add import at top:

```typescript
import type {ThinkingLevel} from '@omnicraft/api-schema';
```

- [ ] **Step 4: Add fields to `SubagentRenderItem` and pass through**

In `apps/frontend/src/pages/chat/components/StreamingMessageDisplay/components/MessageList/hooks/useMessageList.ts`:

```typescript
export interface SubagentRenderItem {
  type: 'subagent';
  agentId: string;
  task: string;
  agentType: string;
  thinkingLevel: ThinkingLevel;
  workingDirectory: string;
  status: 'running' | 'complete' | 'error';
  eventBus: ChatEventBus;
}
```

Add import:

```typescript
import type {ThinkingLevel} from '@omnicraft/api-schema';
```

Update the `case 'subagent'` in `transformMessages`:

```typescript
case 'subagent': {
  items.push({
    type: 'subagent',
    agentId: content.agentId,
    task: content.task,
    agentType: content.agentType,
    thinkingLevel: content.thinkingLevel,
    workingDirectory: content.workingDirectory,
    status: content.status,
    eventBus: content.eventBus,
  });
  break;
}
```

- [ ] **Step 5: Run typecheck**

```bash
cd apps/frontend && bun run typecheck
```

Expected: FAIL — `RenderItem.tsx` and `SubagentDisclosure` don't accept the new props yet. That's expected; we fix them in the next task.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/pages/chat/components/StreamingMessageDisplay/types.ts \
       apps/frontend/src/pages/chat/hooks/useStreamChat.ts \
       apps/frontend/src/pages/chat/components/StreamingMessageDisplay/hooks/useMessages.ts \
       apps/frontend/src/pages/chat/components/StreamingMessageDisplay/components/MessageList/hooks/useMessageList.ts
git commit -m "feat(frontend): propagate agentType, thinkingLevel, workingDirectory through event chain"
```

---

### Task 6: Update SubagentDisclosure to display params, working dir, and usage

**Files:**

- Modify: `apps/frontend/src/pages/chat/components/StreamingMessageDisplay/components/MessageList/components/SubagentDisclosure/SubagentDisclosure.tsx`
- Modify: `apps/frontend/src/pages/chat/components/StreamingMessageDisplay/components/MessageList/components/SubagentDisclosure/SubagentDisclosureView.tsx`
- Modify: `apps/frontend/src/pages/chat/components/StreamingMessageDisplay/components/MessageList/components/SubagentDisclosure/styles.module.css`
- Modify: `apps/frontend/src/pages/chat/components/StreamingMessageDisplay/components/MessageList/components/RenderItem/RenderItem.tsx`

- [ ] **Step 1: Update `SubagentDisclosure.tsx` to accept new props and compose `useUsage`**

```typescript
import {useAutoScroll} from '@/hooks/useAutoScroll.js';

import type {ChatEventBus} from '../../../../types.js';
import {useUsage} from '../../../../../UsageInfo/index.js';
import {SubagentDisclosureView} from './SubagentDisclosureView.js';

interface SubagentDisclosureProps {
  task: string;
  agentType: string;
  thinkingLevel: string;
  workingDirectory: string;
  status: 'running' | 'complete' | 'error';
  eventBus: ChatEventBus;
}

export function SubagentDisclosure({
  task,
  agentType,
  thinkingLevel,
  workingDirectory,
  status,
  eventBus,
}: SubagentDisclosureProps) {
  const {containerRef} = useAutoScroll();
  const {usage} = useUsage(eventBus);

  return (
    <SubagentDisclosureView
      task={task}
      agentType={agentType}
      thinkingLevel={thinkingLevel}
      workingDirectory={workingDirectory}
      status={status}
      eventBus={eventBus}
      usage={usage}
      scrollRef={containerRef}
    />
  );
}
```

- [ ] **Step 2: Update `SubagentDisclosureView.tsx`**

```typescript
import {Disclosure, ScrollShadow, Spinner} from '@heroui/react';
import type {SseUsage} from '@omnicraft/sse-events';
import clsx from 'clsx';
import {Bot, CircleCheck, CircleX} from 'lucide-react';
import {lazy, type RefObject, Suspense} from 'react';

import type {ChatEventBus} from '../../../../types.js';
import {UsageInfo} from '../../../../../UsageInfo/index.js';
import styles from './styles.module.css';

const StreamingMessageDisplay = lazy(async () => {
  const {StreamingMessageDisplay} = await import('../../../../index.js');
  return {default: StreamingMessageDisplay};
});

interface SubagentDisclosureViewProps {
  task: string;
  agentType: string;
  thinkingLevel: string;
  workingDirectory: string;
  status: 'running' | 'complete' | 'error';
  eventBus: ChatEventBus;
  usage: SseUsage | null;
  scrollRef: RefObject<HTMLDivElement | null>;
}

const STATUS_ICON_SIZE = 16;

export function SubagentDisclosureView({
  task,
  agentType,
  thinkingLevel,
  workingDirectory,
  status,
  eventBus,
  usage,
  scrollRef,
}: SubagentDisclosureViewProps) {
  return (
    <div className={styles.wrapper}>
      <div
        className={clsx(styles.card, status === 'running' && styles.running)}
      >
        <Disclosure>
          <Disclosure.Heading>
            <Disclosure.Trigger className={styles.trigger}>
              {status === 'running' && (
                <Spinner size='sm' className={styles.spinner} />
              )}
              {status === 'complete' && (
                <CircleCheck
                  className={styles.statusComplete}
                  size={STATUS_ICON_SIZE}
                />
              )}
              {status === 'error' && (
                <CircleX
                  className={styles.statusError}
                  size={STATUS_ICON_SIZE}
                />
              )}
              <Bot className={styles.botIcon} size={STATUS_ICON_SIZE} />
              <span className={styles.task}>{task}</span>
              <Disclosure.Indicator />
            </Disclosure.Trigger>
          </Disclosure.Heading>
          <Disclosure.Content>
            <Disclosure.Body className={styles.body}>
              <div className={styles.taskDetail}>
                <span className={styles.label}>Task</span>
                <ScrollShadow className={styles.taskText}>{task}</ScrollShadow>
                <span className={styles.workingDir}>{workingDirectory}</span>
              </div>
              <ScrollShadow className={styles.content} ref={scrollRef}>
                <Suspense>
                  <StreamingMessageDisplay
                    eventBus={eventBus}
                    sessionId={null}
                  />
                </Suspense>
              </ScrollShadow>
            </Disclosure.Body>
          </Disclosure.Content>
          <Disclosure.Content>
            <div className={styles.footer}>
              <span className={styles.paramTag}>
                Type: <span className={styles.paramValue}>{agentType}</span>
              </span>
              <span className={styles.paramTag}>
                Thinking:{' '}
                <span className={styles.paramValue}>{thinkingLevel}</span>
              </span>
            </div>
          </Disclosure.Content>
        </Disclosure>
      </div>
      {usage && <UsageInfo usage={usage} />}
    </div>
  );
}
```

- [ ] **Step 3: Add new styles to `styles.module.css`**

Append to existing `apps/frontend/src/pages/chat/components/StreamingMessageDisplay/components/MessageList/components/SubagentDisclosure/styles.module.css`:

```css
.wrapper {
  display: flex;
  flex-direction: column;
}

.workingDir {
  font-size: 0.75rem;
  color: var(--muted);
  font-family: 'SF Mono', 'Fira Code', ui-monospace, monospace;
  margin-top: 2px;
}

.footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-top: 1px solid var(--border);
  background: color-mix(in oklch, var(--surface) 90%, var(--background));
}

.paramTag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: var(
    --tag-bg,
    color-mix(in oklch, var(--foreground) 8%, transparent)
  );
  border-radius: 6px;
  padding: 3px 8px;
  font-size: 0.75rem;
  color: var(--muted);
}

.paramValue {
  color: var(--foreground);
  font-weight: 500;
}
```

- [ ] **Step 4: Update `RenderItem.tsx` to pass new props**

In `apps/frontend/src/pages/chat/components/StreamingMessageDisplay/components/MessageList/components/RenderItem/RenderItem.tsx`, update the `case 'subagent'` (around line 106-115):

```typescript
case 'subagent':
  return (
    <div className={styles.assistantMessage}>
      <SubagentDisclosure
        task={item.task}
        agentType={item.agentType}
        thinkingLevel={item.thinkingLevel}
        workingDirectory={item.workingDirectory}
        status={item.status}
        eventBus={item.eventBus}
      />
    </div>
  );
```

- [ ] **Step 5: Run typecheck**

```bash
cd apps/frontend && bun run typecheck
```

Expected: PASS

- [ ] **Step 6: Run all tests**

```bash
cd apps/frontend && bun run test
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/pages/chat/components/StreamingMessageDisplay/components/MessageList/components/SubagentDisclosure/ \
       apps/frontend/src/pages/chat/components/StreamingMessageDisplay/components/MessageList/components/RenderItem/RenderItem.tsx
git commit -m "feat(frontend): display params, working dir, and usage in SubagentDisclosure"
```

---

### Task 7: Run full lint, format, and typecheck

- [ ] **Step 1: Run lint across the monorepo**

```bash
bun run lint
```

Expected: PASS

- [ ] **Step 2: Run format check**

```bash
bun run format:check
```

Expected: PASS (or fix with `bun run format`)

- [ ] **Step 3: Run all tests**

```bash
bun run test
```

Expected: PASS

- [ ] **Step 4: Commit any lint/format fixes if needed**

---

### Verification

1. Start the dev server and send a chat message that triggers a subagent dispatch
2. Verify the disclosure header still shows task + status icon
3. Expand the disclosure and verify:
   - Task section shows task text and working directory
   - Params footer shows Type and Thinking tags
4. After subagent completes, verify:
   - Usage row appears below the card (model, input/output tokens, cache)
   - Usage row is visible even when disclosure is collapsed
5. Verify the main chat's InfoBar usage display still works correctly
