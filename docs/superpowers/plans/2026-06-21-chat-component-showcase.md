# Chat Component Showcase Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a static `/showcase` route that renders every `chat-stream` card component in every state, co-located inside the `chat-stream` module, for visual review of components left unverified after the Chat UI refactor.

**Architecture:** A new `modules/chat-stream/showcase/` directory holds an MVVM page (`ShowcasePage` container + `ShowcasePageView`) plus two presentational helpers (`ShowcaseSection`, `Specimen`) and a `mock-data.ts` fixtures file. Leaf cards are imported by relative path (they stay internal to the module). The router lazy-mounts the page under the existing `<Layout>` route by deep-importing `@/modules/chat-stream/showcase/index.js` — the page is deliberately NOT re-exported from the module's public `index.ts`, so the debug surface and its mock fixtures stay out of the shared production chunk.

**Tech Stack:** React 19, Vite, React Router 7, HeroUI v3, CSS Modules, Vitest. Schemas from `@omnicraft/sse-events`, `@omnicraft/tool-schemas`, `@omnicraft/api-schema`.

## Global Constraints

- **Package manager / runtime:** Bun. Run commands via `bun run --filter '@omnicraft/frontend' <script>`. Dev server: `bun dev` from repo root.
- **Tests:** `bun run --filter '@omnicraft/frontend' test` (Vitest). NEVER `bun test`.
- **Typecheck:** `bun run --filter '@omnicraft/frontend' build` (runs `tsc -b && vite build`).
- **No `any`.** Use `unknown` + narrowing. Mock fixtures must be typed against the real schema types.
- **MVVM file structure** (per `apps/frontend/CLAUDE.md`): one React component per file; container `X.tsx` (no state, composes hooks) + stateless `XView.tsx` + `index.ts` (no TSX). State lives in hooks under `hooks/`.
- **Exporting:** no default exports. Page component uses plain named export `export {ShowcasePage} from './ShowcasePage.js';`. Non-page components use `export {Component} from './Component.js';`.
- **Importing:** import a component's `index.ts` only, never internal files. Public/shared modules via `@/` alias; component-internal modules via relative paths.
- **Styling:** CSS Modules only. No Tailwind utility classes. Use HeroUI components directly. A component must NOT set its own layout (`margin`/`flex`/`grid-column`/`align-self`); the parent wraps and positions it.
- **Motion:** event-driven only. No ambient/looping animation on showcase chrome.
- **Imports use `.js` extensions** on relative TS imports (ESM convention, matches existing code).

---

## File Structure

```
apps/frontend/src/modules/chat-stream/
├── index.ts                                    # UNCHANGED: page is NOT re-exported here (router deep-imports it)
├── CLAUDE.md                                   # CREATE: module debug-surface + maintenance contract
└── showcase/
    ├── index.ts                                # CREATE: export {ShowcasePage}
    ├── ShowcasePage.tsx                         # CREATE: container — builds mock event bus, assembles sections
    ├── ShowcasePageView.tsx                     # CREATE: view — sticky nav + scrollable sections column
    ├── mock-data.ts                             # CREATE: all fixtures, typed against real schemas
    ├── styles.module.css                        # CREATE: page layout + sticky nav
    └── components/
        ├── ShowcaseSection/
        │   ├── index.ts                         # CREATE
        │   ├── ShowcaseSection.tsx              # CREATE (single-file view; no state)
        │   └── styles.module.css                # CREATE
        └── Specimen/
            ├── index.ts                         # CREATE
            ├── Specimen.tsx                     # CREATE (single-file view; no state)
            └── styles.module.css                # CREATE

apps/frontend/src/
├── routes.ts                                    # MODIFY: add showcase: {}
├── router/lazy-pages.tsx                        # MODIFY: add lazy ShowcasePage
└── router/router.tsx                            # MODIFY: add route under <Layout>
```

Build order: leaf presentational helpers first (Specimen, ShowcaseSection), then mock data, then the view + container, then route wiring, then the CLAUDE.md doc. Each task ends with a typecheck and a commit. The page is verified in the browser at the end.

---

### Task 1: `Specimen` presentational wrapper

A stateless wrapper that renders a caption strip (state label) above an arbitrary child component. This is the only showcase-specific chrome.

**Files:**

- Create: `apps/frontend/src/modules/chat-stream/showcase/components/Specimen/Specimen.tsx`
- Create: `apps/frontend/src/modules/chat-stream/showcase/components/Specimen/index.ts`
- Create: `apps/frontend/src/modules/chat-stream/showcase/components/Specimen/styles.module.css`

**Interfaces:**

- Produces: `Specimen` component with props `{label: string; children: ReactNode}`.

- [ ] **Step 1: Create the view component**

`Specimen.tsx`:

```tsx
import type {ReactNode} from 'react';

import styles from './styles.module.css';

interface SpecimenProps {
  label: string;
  children: ReactNode;
}

export function Specimen({label, children}: SpecimenProps) {
  return (
    <div className={styles.specimen}>
      <span className={styles.label}>{label}</span>
      <div className={styles.body}>{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: Create the styles**

`styles.module.css`:

```css
.specimen {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.label {
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--muted);
}

.body {
  display: flex;
  flex-direction: column;
}
```

- [ ] **Step 3: Create the barrel export**

`index.ts`:

```ts
export {Specimen} from './Specimen.js';
```

- [ ] **Step 4: Typecheck**

Run: `bun run --filter '@omnicraft/frontend' build`
Expected: PASS (no type errors). The page is not yet routed, so this only checks the new file compiles.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/modules/chat-stream/showcase/components/Specimen
git commit -m "feat(showcase): add Specimen caption wrapper"
```

---

### Task 2: `ShowcaseSection` group wrapper

A stateless titled group with an `id` anchor (for the sticky nav) and a heading.

**Files:**

- Create: `apps/frontend/src/modules/chat-stream/showcase/components/ShowcaseSection/ShowcaseSection.tsx`
- Create: `apps/frontend/src/modules/chat-stream/showcase/components/ShowcaseSection/index.ts`
- Create: `apps/frontend/src/modules/chat-stream/showcase/components/ShowcaseSection/styles.module.css`

**Interfaces:**

- Consumes: nothing.
- Produces: `ShowcaseSection` component with props `{id: string; title: string; children: ReactNode}`.

- [ ] **Step 1: Create the view component**

`ShowcaseSection.tsx`:

```tsx
import type {ReactNode} from 'react';

import styles from './styles.module.css';

interface ShowcaseSectionProps {
  id: string;
  title: string;
  children: ReactNode;
}

export function ShowcaseSection({id, title, children}: ShowcaseSectionProps) {
  return (
    <section id={id} className={styles.section}>
      <h2 className={styles.heading}>{title}</h2>
      <div className={styles.specimens}>{children}</div>
    </section>
  );
}
```

- [ ] **Step 2: Create the styles**

`styles.module.css`:

```css
.section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  scroll-margin-top: 4rem;
}

.heading {
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--foreground);
}

.specimens {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}
```

- [ ] **Step 3: Create the barrel export**

`index.ts`:

```ts
export {ShowcaseSection} from './ShowcaseSection.js';
```

- [ ] **Step 4: Typecheck**

Run: `bun run --filter '@omnicraft/frontend' build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/modules/chat-stream/showcase/components/ShowcaseSection
git commit -m "feat(showcase): add ShowcaseSection group wrapper"
```

---

### Task 3: Mock data fixtures

All mock props for every specimen, typed against the real schemas. This is the single source of fixtures the view consumes. The subagent fixture owns a constructed `EventBus`.

**Files:**

- Create: `apps/frontend/src/modules/chat-stream/showcase/mock-data.ts`

**Interfaces:**

- Consumes: schema types from `@omnicraft/tool-schemas`, `@omnicraft/sse-events`, `@omnicraft/api-schema`; `EventBus` from `@/helpers/event-bus.js`; `ChatEventMap` type from `../types.js`.
- Produces (all exported consts):
  - `askUserArgsFreeText: string` — JSON string of ask_user parameters (free-text questions).
  - `askUserArgsOptions: string` — JSON string with option-bearing questions.
  - `askUserDoneData: ToolResultData<'ask_user'>` — `{answers: [...]}`.
  - `askUserFailureData: ToolFailureData` — `{message: string}`.
  - `noopAskUserSubmit: AskUserSubmitHandler` — `() => Promise.resolve()`.
  - `readFileData`, `writeFileData`, `editFileData`, `runCommandData`, `findFilesData`, `searchFilesData`, `webFetchData`, `webSearchData`, `loadSkillData` — each the matching `ToolResultData<...>`.
  - `readFileArgs`, `runCommandArgs`, `webSearchArgs`, etc. — JSON-string arguments per tool.
  - `toolFailureData: ToolFailureData`.
  - `todoItemsMixed: readonly SseTodoItem[]`, `todoItemsComplete: readonly SseTodoItem[]`.
  - `thinkingContent: string`.
  - `compactionSummary: string`.
  - `userMessageShort: string`, `userMessageMarkdown: string`, `assistantMessageMarkdown: string`.
  - `makeSubagentEventBus(): ChatEventBus` — constructs an `EventBus` (no pre-emitted events needed; the nested display subscribes lazily).
  - `subagentBaseProps` — `{agentId, nickname, task, agentType, thinkingLevel, workingDirectory}` shared across subagent specimens.

- [ ] **Step 1: Create the fixtures file**

`mock-data.ts`:

````ts
import type {ThinkingLevel} from '@omnicraft/api-schema';
import type {SseTodoItem} from '@omnicraft/sse-events';
import type {ToolFailureData, ToolResultData} from '@omnicraft/tool-schemas';

import {EventBus} from '@/helpers/event-bus.js';
import type {
  AskUserSubmitHandler,
  ChatEventBus,
  ChatEventMap,
} from '@/modules/chat-events/index.js';

// --- ask_user ---

export const askUserArgsFreeText = JSON.stringify({
  questions: [
    {question: 'What should we name the new module?', options: []},
    {question: 'Describe the desired behavior in one sentence.', options: []},
  ],
});

export const askUserArgsOptions = JSON.stringify({
  questions: [
    {
      question: 'Which package manager should the script assume?',
      options: ['bun', 'npm', 'pnpm', 'yarn'],
    },
    {
      question: 'Run tests before committing?',
      options: ['Yes', 'No'],
    },
  ],
});

export const askUserDoneData: ToolResultData<'ask_user'> = {
  answers: [
    {
      question: 'Which package manager should the script assume?',
      answer: 'bun',
    },
    {question: 'Run tests before committing?', answer: 'Yes'},
  ],
};

export const askUserFailureData: ToolFailureData = {
  message: 'The user cancelled the prompt before answering.',
};

export const noopAskUserSubmit: AskUserSubmitHandler = () => Promise.resolve();

// --- tool results ---

export const readFileArgs = JSON.stringify({
  filePath: 'apps/frontend/src/main.tsx',
});
export const readFileData: ToolResultData<'read_file'> = {
  filePath: 'apps/frontend/src/main.tsx',
  totalLines: 23,
  startLine: 1,
  endLine: 3,
  content:
    "import {StrictMode} from 'react';\nimport {createRoot} from 'react-dom/client';\n// ...",
};

export const writeFileArgs = JSON.stringify({
  filePath: 'apps/frontend/src/new-file.ts',
  content: 'export const placeholder = true;\n',
});
export const writeFileData: ToolResultData<'write_file'> = {
  filePath: 'apps/frontend/src/new-file.ts',
  lineCount: 1,
};

export const editFileArgs = JSON.stringify({
  filePath: 'apps/frontend/src/router/router.tsx',
  oldString: 'path: ROUTES.coding(),',
  newString: 'path: ROUTES.showcase(),',
});
export const editFileData: ToolResultData<'edit_file'> = {
  filePath: 'apps/frontend/src/router/router.tsx',
  matchCount: 1,
  diff: '--- a/apps/frontend/src/router/router.tsx\n+++ b/apps/frontend/src/router/router.tsx\n@@ -60,0 +60,4 @@\n+      {\n+        path: ROUTES.showcase(),\n+        element: <ShowcasePage />,\n+      },',
  truncated: false,
};

export const findFilesArgs = JSON.stringify({pattern: '**/*.module.css'});
export const findFilesData: ToolResultData<'find_files'> = {
  pattern: '**/*.module.css',
  basePath: 'apps/frontend/src',
  files: [
    'apps/frontend/src/pages/chat/styles.module.css',
    'apps/frontend/src/modules/chat-stream/showcase/styles.module.css',
  ],
  truncated: false,
};

export const searchFilesArgs = JSON.stringify({pattern: 'ShowcasePage'});
export const searchFilesData: ToolResultData<'search_files'> = {
  pattern: 'ShowcasePage',
  basePath: 'apps/frontend/src',
  matches: [
    {
      file: 'apps/frontend/src/router/lazy-pages.tsx',
      line: 10,
      content: 'export const ShowcasePage = lazy(async () => {',
    },
  ],
  truncated: false,
};

export const runCommandArgs = JSON.stringify({command: 'bun run test'});
export const runCommandData: ToolResultData<'run_command'> = {
  command: 'bun run test',
  exitCode: 0,
  timedOut: false,
  cwd: '/repo/apps/frontend',
  stdout: 'Test Files  12 passed (12)\n     Tests  48 passed (48)',
  stderr: '',
};

export const webFetchArgs = JSON.stringify({url: 'https://bun.com/docs'});
export const webFetchData: ToolResultData<'web_fetch'> = {
  url: 'https://bun.com/docs',
  title: 'Bun Documentation',
  content: '# Bun\nBun is an all-in-one JavaScript runtime & toolkit...',
};

export const webSearchArgs = JSON.stringify({
  query: 'react router 7 lazy routes',
});
export const webSearchData: ToolResultData<'web_search'> = {
  results: [
    {
      title: 'Lazy Loading - React Router',
      url: 'https://reactrouter.com/start/lazy',
      score: 0.94,
      content: 'Route modules can be loaded lazily to split bundles...',
    },
  ],
};

export const loadSkillArgs = JSON.stringify({name: 'frontend-design'});
export const loadSkillData: ToolResultData<'load_skill'> = {
  name: 'frontend-design',
  content:
    '# Frontend Design\nGuidance for distinctive, intentional visual design...',
};

export const toolFailureData: ToolFailureData = {
  message: 'Command exited with code 1: file not found.',
};

// --- todo ---

export const todoItemsMixed: readonly SseTodoItem[] = [
  {
    index: 0,
    subject: 'Add Specimen wrapper',
    description: 'Caption + child',
    status: 'completed',
  },
  {
    index: 1,
    subject: 'Add ShowcaseSection',
    description: 'Titled group',
    status: 'completed',
  },
  {
    index: 2,
    subject: 'Wire mock data',
    description: 'All fixtures',
    status: 'in_progress',
  },
  {
    index: 3,
    subject: 'Register route',
    description: 'router + lazy-pages',
    status: 'pending',
  },
];

export const todoItemsComplete: readonly SseTodoItem[] = [
  {
    index: 0,
    subject: 'Add Specimen wrapper',
    description: 'Caption + child',
    status: 'completed',
  },
  {
    index: 1,
    subject: 'Add ShowcaseSection',
    description: 'Titled group',
    status: 'completed',
  },
];

// --- text / thinking / compaction ---

export const thinkingContent =
  'The user wants every card rendered statically. I should render leaf containers directly with mock props rather than feeding SSE events through the pipeline.';

export const compactionSummary =
  'Summarized the early exploration into a compact note: chat-stream cards are internal; showcase lives inside the module.';

export const userMessageShort =
  'Build a showcase page for the chat components.';

export const userMessageMarkdown =
  'Here is what I need:\n\n- Render **every** card\n- Cover all states\n- Reviewable in `light` and `dark`\n\n```ts\nconst ok = true;\n```';

export const assistantMessageMarkdown =
  "I'll build a `/showcase` route inside the `chat-stream` module.\n\n1. Specimen wrapper\n2. Section group\n3. Mock fixtures";

// --- subagent ---

export const subagentBaseProps = {
  agentId: 'agent-showcase-001',
  nickname: 'Showcase Explorer',
  task: 'Map all chat-stream components and their states for the showcase page.',
  agentType: 'Explore',
  thinkingLevel: 'medium' as ThinkingLevel,
  workingDirectory: '/repo/apps/frontend',
};

export function makeSubagentEventBus(): ChatEventBus {
  return new EventBus<ChatEventMap>();
}
````

- [ ] **Step 2: Verify `ThinkingLevel` accepts `'medium'`**

Run: `grep -rn "ThinkingLevel" packages/api-schema/src | head`
Expected: confirms the literal union includes `'medium'`. If not, replace `'medium'` with a valid member (e.g. the first listed) in `subagentBaseProps`.

- [ ] **Step 3: Typecheck**

Run: `bun run --filter '@omnicraft/frontend' build`
Expected: PASS. Any mismatch between a fixture and its schema surfaces here — fix the fixture to match the real type.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/modules/chat-stream/showcase/mock-data.ts
git commit -m "feat(showcase): add typed mock fixtures for all chat cards"
```

---

### Task 4: `ShowcasePageView` — render all specimens

The stateless view. Renders the sticky in-page nav and every `ShowcaseSection` with its `Specimen`s, importing each leaf card by its `index.ts`.

**Files:**

- Create: `apps/frontend/src/modules/chat-stream/showcase/ShowcasePageView.tsx`
- Create: `apps/frontend/src/modules/chat-stream/showcase/styles.module.css`

**Interfaces:**

- Consumes: all exports from `./mock-data.js`; `Specimen` and `ShowcaseSection`; the leaf card `index.ts` files (relative paths); `ChatEventBus` type from `../types.js`.
- Produces: `ShowcasePageView` component with props `{subagentEventBus: ChatEventBus}` (the bus is constructed in the container so the view stays stateless).

- [ ] **Step 1: Create the view**

`ShowcasePageView.tsx`:

```tsx
import type {ChatEventBus} from '@/modules/chat-events/index.js';

import {AssistantMessage} from '../components/MessageList/components/AssistantMessage/index.js';
import {AskUserCard} from '../components/MessageList/components/AskUserCard/index.js';
import {ContextCompactionBlock} from '../components/MessageList/components/ContextCompactionBlock/index.js';
import {SubagentDisclosure} from '../components/MessageList/components/SubagentDisclosure/index.js';
import {ThinkingBlock} from '../components/MessageList/components/ThinkingBlock/index.js';
import {TodoCard} from '../components/MessageList/components/TodoCard/index.js';
import {ToolExecutionCard} from '../components/MessageList/components/ToolExecutionCard/index.js';
import {UserMessage} from '../components/MessageList/components/UserMessage/index.js';
import {WorkingIndicator} from '../components/MessageList/components/WorkingIndicator/index.js';
import {ShowcaseSection} from './components/ShowcaseSection/index.js';
import {Specimen} from './components/Specimen/index.js';
import * as mock from './mock-data.js';
import styles from './styles.module.css';

interface ShowcasePageViewProps {
  subagentEventBus: ChatEventBus;
}

const SECTIONS = [
  {id: 'messages', title: 'Messages'},
  {id: 'ask-user', title: 'AskUserCard'},
  {id: 'tools', title: 'ToolExecutionCard'},
  {id: 'thinking', title: 'ThinkingBlock'},
  {id: 'todo', title: 'TodoCard'},
  {id: 'subagent', title: 'SubagentDisclosure'},
  {id: 'compaction', title: 'ContextCompactionBlock'},
  {id: 'working', title: 'WorkingIndicator'},
] as const;

export function ShowcasePageView({subagentEventBus}: ShowcasePageViewProps) {
  return (
    <div className={styles.page}>
      <nav className={styles.nav}>
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className={styles.navLink}>
            {s.title}
          </a>
        ))}
      </nav>
      <div className={styles.column}>
        <ShowcaseSection id='messages' title='Messages'>
          <Specimen label='user · short'>
            <UserMessage id='u1' content={mock.userMessageShort} />
          </Specimen>
          <Specimen label='user · markdown'>
            <UserMessage id='u2' content={mock.userMessageMarkdown} />
          </Specimen>
          <Specimen label='assistant · markdown'>
            <AssistantMessage id='a1' content={mock.assistantMessageMarkdown} />
          </Specimen>
          <Specimen label='assistant · empty (streaming)'>
            <AssistantMessage id='a2' content='' />
          </Specimen>
        </ShowcaseSection>

        <ShowcaseSection id='ask-user' title='AskUserCard'>
          <Specimen label='running · free text'>
            <AskUserCard
              status='running'
              callId='ask-1'
              arguments={mock.askUserArgsFreeText}
              onSubmit={mock.noopAskUserSubmit}
            />
          </Specimen>
          <Specimen label='running · with options'>
            <AskUserCard
              status='running'
              callId='ask-2'
              arguments={mock.askUserArgsOptions}
              onSubmit={mock.noopAskUserSubmit}
            />
          </Specimen>
          <Specimen label='done'>
            <AskUserCard
              status='done'
              callId='ask-3'
              arguments={mock.askUserArgsOptions}
              onSubmit={mock.noopAskUserSubmit}
              data={mock.askUserDoneData}
            />
          </Specimen>
          <Specimen label='failure'>
            <AskUserCard
              status='failure'
              callId='ask-4'
              arguments={mock.askUserArgsOptions}
              onSubmit={mock.noopAskUserSubmit}
              data={mock.askUserFailureData}
            />
          </Specimen>
          <Specimen label='error'>
            <AskUserCard
              status='error'
              callId='ask-5'
              arguments={mock.askUserArgsOptions}
              onSubmit={mock.noopAskUserSubmit}
              data={mock.askUserFailureData}
            />
          </Specimen>
        </ShowcaseSection>

        <ShowcaseSection id='tools' title='ToolExecutionCard'>
          <Specimen label='running'>
            <ToolExecutionCard
              callId='t-run'
              toolName='read_file'
              displayName='Read File'
              arguments={mock.readFileArgs}
              status='running'
            />
          </Specimen>
          <Specimen label='failure'>
            <ToolExecutionCard
              callId='t-fail'
              toolName='run_command'
              displayName='Run Command'
              arguments={mock.runCommandArgs}
              status='failure'
              data={mock.toolFailureData}
            />
          </Specimen>
          <Specimen label='error'>
            <ToolExecutionCard
              callId='t-err'
              toolName='run_command'
              displayName='Run Command'
              arguments={mock.runCommandArgs}
              status='error'
              data={mock.toolFailureData}
            />
          </Specimen>
          <Specimen label='read_file · done'>
            <ToolExecutionCard
              callId='t-read'
              toolName='read_file'
              displayName='Read File'
              arguments={mock.readFileArgs}
              status='done'
              data={mock.readFileData}
            />
          </Specimen>
          <Specimen label='write_file · done'>
            <ToolExecutionCard
              callId='t-write'
              toolName='write_file'
              displayName='Write File'
              arguments={mock.writeFileArgs}
              status='done'
              data={mock.writeFileData}
            />
          </Specimen>
          <Specimen label='edit_file · done'>
            <ToolExecutionCard
              callId='t-edit'
              toolName='edit_file'
              displayName='Edit File'
              arguments={mock.editFileArgs}
              status='done'
              data={mock.editFileData}
            />
          </Specimen>
          <Specimen label='run_command · done'>
            <ToolExecutionCard
              callId='t-cmd'
              toolName='run_command'
              displayName='Run Command'
              arguments={mock.runCommandArgs}
              status='done'
              data={mock.runCommandData}
            />
          </Specimen>
          <Specimen label='find_files · done'>
            <ToolExecutionCard
              callId='t-find'
              toolName='find_files'
              displayName='Find Files'
              arguments={mock.findFilesArgs}
              status='done'
              data={mock.findFilesData}
            />
          </Specimen>
          <Specimen label='search_files · done'>
            <ToolExecutionCard
              callId='t-search'
              toolName='search_files'
              displayName='Search Files'
              arguments={mock.searchFilesArgs}
              status='done'
              data={mock.searchFilesData}
            />
          </Specimen>
          <Specimen label='web_fetch · done'>
            <ToolExecutionCard
              callId='t-fetch'
              toolName='web_fetch'
              displayName='Web Fetch'
              arguments={mock.webFetchArgs}
              status='done'
              data={mock.webFetchData}
            />
          </Specimen>
          <Specimen label='web_search · done'>
            <ToolExecutionCard
              callId='t-websearch'
              toolName='web_search'
              displayName='Web Search'
              arguments={mock.webSearchArgs}
              status='done'
              data={mock.webSearchData}
            />
          </Specimen>
          <Specimen label='load_skill · done'>
            <ToolExecutionCard
              callId='t-skill'
              toolName='load_skill'
              displayName='Load Skill'
              arguments={mock.loadSkillArgs}
              status='done'
              data={mock.loadSkillData}
            />
          </Specimen>
        </ShowcaseSection>

        <ShowcaseSection id='thinking' title='ThinkingBlock'>
          <Specimen label='thinking (not done)'>
            <ThinkingBlock content={mock.thinkingContent} done={false} />
          </Specimen>
          <Specimen label='done'>
            <ThinkingBlock content={mock.thinkingContent} done={true} />
          </Specimen>
        </ShowcaseSection>

        <ShowcaseSection id='todo' title='TodoCard'>
          <Specimen label='in progress (mixed)'>
            <TodoCard items={mock.todoItemsMixed} />
          </Specimen>
          <Specimen label='all complete'>
            <TodoCard items={mock.todoItemsComplete} />
          </Specimen>
        </ShowcaseSection>

        <ShowcaseSection id='subagent' title='SubagentDisclosure'>
          <Specimen label='running'>
            <SubagentDisclosure
              mode='dispatch'
              status='running'
              eventBus={subagentEventBus}
              {...mock.subagentBaseProps}
            />
          </Specimen>
          <Specimen label='complete'>
            <SubagentDisclosure
              mode='dispatch'
              status='complete'
              eventBus={subagentEventBus}
              {...mock.subagentBaseProps}
            />
          </Specimen>
          <Specimen label='error'>
            <SubagentDisclosure
              mode='resume'
              status='error'
              eventBus={subagentEventBus}
              {...mock.subagentBaseProps}
            />
          </Specimen>
        </ShowcaseSection>

        <ShowcaseSection id='compaction' title='ContextCompactionBlock'>
          <Specimen label='in-progress'>
            <ContextCompactionBlock status='in-progress' />
          </Specimen>
          <Specimen label='done'>
            <ContextCompactionBlock
              status='done'
              beforeTokens={128000}
              afterTokens={32000}
              summary={mock.compactionSummary}
            />
          </Specimen>
          <Specimen label='failed'>
            <ContextCompactionBlock
              status='failed'
              errorMessage='Compaction aborted: upstream timeout.'
            />
          </Specimen>
        </ShowcaseSection>

        <ShowcaseSection id='working' title='WorkingIndicator'>
          <Specimen label='default'>
            <WorkingIndicator />
          </Specimen>
        </ShowcaseSection>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the page styles**

`styles.module.css`:

```css
.page {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  max-width: 48rem;
  margin: 0 auto;
  padding: 2rem 1rem 6rem;
}

.nav {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 0.75rem;
  padding: 0.75rem 1rem;
  border-radius: 0.75rem;
  background: var(--surface);
  border: 1px solid var(--border);
}

.navLink {
  font-size: 0.8125rem;
  color: var(--muted);
  text-decoration: none;
}

.navLink:hover {
  text-decoration: underline;
}

.column {
  display: flex;
  flex-direction: column;
  gap: 2.5rem;
}
```

- [ ] **Step 3: Verify the leaf-card import paths resolve**

Run: `bun run --filter '@omnicraft/frontend' build`
Expected: PASS. If a relative import path is wrong, `tsc` reports "Cannot find module" — fix the path against the actual directory listing under `components/MessageList/components/`.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/modules/chat-stream/showcase/ShowcasePageView.tsx apps/frontend/src/modules/chat-stream/showcase/styles.module.css
git commit -m "feat(showcase): render all chat card specimens in the view"
```

---

### Task 5: `ShowcasePage` container + barrel export

The container constructs the subagent event bus once (stable across renders) and passes it to the view. No other state.

**Files:**

- Create: `apps/frontend/src/modules/chat-stream/showcase/ShowcasePage.tsx`
- Create: `apps/frontend/src/modules/chat-stream/showcase/index.ts`

**Interfaces:**

- Consumes: `ShowcasePageView`; `makeSubagentEventBus` from `./mock-data.js`.
- Produces: `ShowcasePage` (page component, plain named export per CLAUDE.md page convention).

- [ ] **Step 1: Create the container**

`ShowcasePage.tsx`:

```tsx
import {useState} from 'react';

import {makeSubagentEventBus} from './mock-data.js';
import {ShowcasePageView} from './ShowcasePageView.js';

export function ShowcasePage() {
  const [subagentEventBus] = useState(makeSubagentEventBus);

  return <ShowcasePageView subagentEventBus={subagentEventBus} />;
}
```

- [ ] **Step 2: Create the barrel export**

`index.ts` (page convention — plain named export, lazy loading handled centrally):

```ts
export {ShowcasePage} from './ShowcasePage.js';
```

- [ ] **Step 3: Typecheck**

Run: `bun run --filter '@omnicraft/frontend' build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/modules/chat-stream/showcase/ShowcasePage.tsx apps/frontend/src/modules/chat-stream/showcase/index.ts
git commit -m "feat(showcase): add ShowcasePage container"
```

---

### Task 6: Register the route via a deep import

Mount the page from the router by deep-importing the showcase's own `index.ts`.
The page is deliberately NOT re-exported from the module's public `index.ts`,
so the debug surface and its mock fixtures stay out of the shared production
chunk that `/chat` and `/coding` load (see `chat-stream/CLAUDE.md`).

**Files:**

- Modify: `apps/frontend/src/routes.ts` (add `showcase: {}`)
- Modify: `apps/frontend/src/router/lazy-pages.tsx` (add lazy loader, deep import)
- Modify: `apps/frontend/src/router/router.tsx` (add route under `<Layout>`)

**Interfaces:**

- Consumes: `ShowcasePage` from `@/modules/chat-stream/showcase/index.js`.
- Produces: a reachable `/showcase` route; `ROUTES.showcase()` path helper.

- [ ] **Step 1: Add the route key**

In `apps/frontend/src/routes.ts`, add `showcase: {}` to the `defineRoutes` map:

```ts
export const ROUTES = defineRoutes({
  dashboard: {},
  chat: {},
  coding: {},
  showcase: {},
  settings: {
    llm: {chat: {}, coding: {}},
    agent: {runtime: {}},
    'file-access': {workspaces: {}},
    tools: {search: {}},
  },
});
```

- [ ] **Step 2: Add the lazy loader (deep import)**

In `apps/frontend/src/router/lazy-pages.tsx`, add:

```tsx
export const ShowcasePage = lazy(async () => {
  const {ShowcasePage} =
    await import('@/modules/chat-stream/showcase/index.js');
  return {default: ShowcasePage};
});
```

- [ ] **Step 3: Register the route**

In `apps/frontend/src/router/router.tsx`:

- Add `ShowcasePage` to the import list from `./lazy-pages.js`.
- Add this child to the `<Layout>` `children` array (after the `coding` route):

```tsx
{
  path: ROUTES.showcase(),
  element: <ShowcasePage />,
},
```

- [ ] **Step 4: Typecheck**

Run: `bun run --filter '@omnicraft/frontend' build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/routes.ts apps/frontend/src/router/lazy-pages.tsx apps/frontend/src/router/router.tsx
git commit -m "feat(showcase): register /showcase route"
```

---

### Task 7: Module `CLAUDE.md` with maintenance contract

Document the showcase as the module's debug surface and the rule to keep the catalog in sync.

**Files:**

- Create: `apps/frontend/src/modules/chat-stream/CLAUDE.md`

- [ ] **Step 1: Write the CLAUDE.md**

`apps/frontend/src/modules/chat-stream/CLAUDE.md`:

```markdown
# chat-stream Module

This module renders the chat message stream. The leaf card components under
`components/MessageList/components/` (AskUserCard, ToolExecutionCard,
ThinkingBlock, TodoCard, SubagentDisclosure, ContextCompactionBlock,
WorkingIndicator, UserMessage, AssistantMessage) are internal to this module —
only `StreamingMessageDisplay`, `UsageInfo`, `ShowcasePage`, and types are
exported from `index.ts`.

## Showcase (debug surface)

`showcase/` is a static visual-review page mounted at `/showcase`. It renders
every chat card in every state with mock fixtures (`showcase/mock-data.ts`),
importing the internal cards by relative path. Use it to eyeball each card in
both light and dark themes without driving a live session.

### Maintenance contract

Whenever you add or remove a chat card component under
`components/MessageList/components/`, update the showcase in the SAME change:

- **Added a component:** add a `ShowcaseSection` (and `Specimen`s for every
  state) to `showcase/ShowcasePageView.tsx`, plus its fixtures to
  `showcase/mock-data.ts`.
- **Removed a component:** delete its section and fixtures.

Keeping the catalog complete is what makes the showcase a reliable review
surface — a stale showcase is worse than none.
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/modules/chat-stream/CLAUDE.md
git commit -m "docs(chat-stream): document showcase debug surface and maintenance contract"
```

---

### Task 8: Browser verification (both themes)

The deliverable is the page; verify it renders for real. (Per `apps/frontend/CLAUDE.md`: validate UI changes in a real browser in both themes.)

**Files:** none (manual/tool verification).

- [ ] **Step 1: Start the dev server**

Run from repo root: `bun dev`
Expected: Vite serves the frontend; note the URL (e.g. `http://localhost:5173`).

- [ ] **Step 2: Open `/showcase` and check the light theme**

Navigate to `<url>/showcase`. Verify, using the webapp-testing / browser tooling:

- All 8 sections render; sticky nav anchors jump to each.
- AskUserCard shows running (free-text + options), done (CompletedCard with answers), failure, and error (CancelledCard with message).
- ToolExecutionCard renders running/failure/error and all 11 done sub-renderers without crashing when expanded.
- SubagentDisclosure renders for running/complete/error and expands to a nested (empty) stream without error.
- ThinkingBlock, TodoCard, ContextCompactionBlock, WorkingIndicator render.
- No console errors.

- [ ] **Step 3: Toggle to dark theme and re-check**

Use the app's theme toggle (the page is inside `<Layout>`). Verify every section is legible and correctly styled in dark mode.

- [ ] **Step 4: Capture screenshots**

Capture both light and dark `/showcase` screenshots (needed for any PR per `apps/frontend/CLAUDE.md`). Report which cards, if any, render incorrectly — this is the whole point of the page.

- [ ] **Step 5: Final full check**

Run: `bun run --filter '@omnicraft/frontend' test` and `bun run --filter '@omnicraft/frontend' build`
Expected: both PASS.

---

## Self-Review Notes

- **Spec coverage:** Every component in the spec's specimen catalog has a `Specimen` in Task 4 (Messages, AskUserCard ×5, ToolExecutionCard ×12, ThinkingBlock ×2, TodoCard ×2, SubagentDisclosure ×3, ContextCompactionBlock ×3, WorkingIndicator ×1). Location-inside-module (spec Architecture) → Tasks 1–6. Single module export → Task 6. CLAUDE.md maintenance contract (spec) → Task 7. Both-theme browser review (spec Goals) → Task 8.
- **Open question from spec (SubagentDisclosure providers):** Task 8 Step 2 explicitly verifies the nested `StreamingMessageDisplay` renders without a provider. If it throws for a missing context, the fix is to wrap that specimen in the required provider (e.g. `ToolOutputProvider` / a `ChatEventBusProvider`) — handle during execution; the constructed `EventBus` is already passed directly as a prop, so no `useChatEventBus` context is needed by `SubagentDisclosure` itself.
- **Types:** fixture types (`ToolResultData<'read_file'>`, etc.) match the `registry.ts` definitions read from source; `SseTodoItem` fields (`index/subject/description/status`) match `schema.ts`; `AskUserCard` discriminated-union prop requirements (`data` for done/failure/error) match `AskUserCard.tsx`.
