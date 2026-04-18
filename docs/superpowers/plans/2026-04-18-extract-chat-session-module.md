# Extract `modules/chat-session` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move shared chat-session components, contexts, hooks, and helpers from `pages/chat/` into `src/modules/chat-session/` so future agent pages can reuse them.

**Architecture:** All internal chat-session files move as a group into `src/modules/chat-session/`. The page shell (`ChatPage.tsx`, `ChatPageView.tsx`) stays in `pages/chat/` and updates imports to point at the new module barrel export. `SessionIdProvider` gains route props for page-specific navigation.

**Tech Stack:** React, TypeScript, CSS Modules, Vite (path alias `@/`)

**Spec:** `docs/superpowers/specs/2026-04-18-extract-chat-session-module-design.md`

---

### Task 1: Create module directory and move files

**Files:**

- Create: `apps/frontend/src/modules/chat-session/index.ts`
- Move: all contents from `apps/frontend/src/pages/chat/components/`, `contexts/`, `hooks/`, `helpers/`, `styles.module.css` into `apps/frontend/src/modules/chat-session/`

- [ ] **Step 1: Create the module directory structure**

```bash
mkdir -p apps/frontend/src/modules/chat-session
```

- [ ] **Step 2: Move components, contexts, hooks, helpers, and styles**

```bash
cd apps/frontend/src

# Move directories
mv pages/chat/components modules/chat-session/components
mv pages/chat/contexts modules/chat-session/contexts
mv pages/chat/hooks modules/chat-session/hooks
mv pages/chat/helpers modules/chat-session/helpers

# Move shared styles
mv pages/chat/styles.module.css modules/chat-session/styles.module.css
```

- [ ] **Step 3: Verify the moved structure**

```bash
find apps/frontend/src/modules/chat-session -type f | head -50
```

Expected: all component, context, hook, helper, and style files present under `modules/chat-session/`.

- [ ] **Step 4: Verify pages/chat/ only has page-specific files**

```bash
ls apps/frontend/src/pages/chat/
```

Expected output:

```
ChatPage.tsx
ChatPageView.tsx
index.ts
```

- [ ] **Step 5: Commit**

```bash
git add -A apps/frontend/src/modules/ apps/frontend/src/pages/chat/
git commit -m "refactor: move chat-session files to modules/chat-session"
```

---

### Task 2: Parameterize `SessionIdProvider` route navigation

**Files:**

- Modify: `apps/frontend/src/modules/chat-session/contexts/SessionIdContext/SessionIdProvider.tsx`

The provider currently hardcodes `/chat/${id}` and `ROUTES.chat()`. Make it accept route props so different pages can provide their own routes.

- [ ] **Step 1: Add route props to SessionIdProvider**

In `apps/frontend/src/modules/chat-session/contexts/SessionIdContext/SessionIdProvider.tsx`, update the interface and component:

```tsx
interface SessionIdProviderProps {
  children: React.ReactNode;
  /** Build the full route path for a session. e.g. (id) => `/chat/${id}` */
  buildSessionRoute: (sessionId: string) => string;
  /** Route to navigate to when clearing the session. e.g. '/chat' */
  baseRoute: string;
}

export function SessionIdProvider({
  children,
  buildSessionRoute,
  baseRoute,
}: SessionIdProviderProps) {
```

- [ ] **Step 2: Replace hardcoded routes with props**

Replace the two hardcoded navigation calls:

Line with `void navigate('/chat/${id}', {replace: true})` becomes:

```tsx
void navigate(buildSessionRoute(id), {replace: true});
```

Line with `void navigate(ROUTES.chat(), {replace: true})` becomes:

```tsx
void navigate(baseRoute, {replace: true});
```

Remove the `import {ROUTES} from '@/routes.js';` since it's no longer needed.

- [ ] **Step 3: Verify the file builds**

```bash
cd apps/frontend && bunx tsc --noEmit --pretty 2>&1 | head -30
```

Expected: may show errors in `ChatPage.tsx` (which hasn't been updated yet to pass the new props). No errors within the module itself.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/modules/chat-session/contexts/SessionIdContext/SessionIdProvider.tsx
git commit -m "refactor: parameterize SessionIdProvider route navigation"
```

---

### Task 3: Create the module barrel export

**Files:**

- Create: `apps/frontend/src/modules/chat-session/index.ts`

- [ ] **Step 1: Write the barrel export**

Create `apps/frontend/src/modules/chat-session/index.ts`:

```typescript
// Components
export {ChatAlert} from './components/ChatAlert/index.js';
export {ChatInput} from './components/ChatInput/index.js';
export {InfoBar} from './components/InfoBar/index.js';
export {SessionSetup} from './components/SessionSetup/index.js';
export {SessionSidebar} from './components/SessionSidebar/index.js';
export {StreamingMessageDisplay} from './components/StreamingMessageDisplay/index.js';
export {TitleBarView} from './components/TitleBar/index.js';

// Contexts (providers)
export {ChatEventBusProvider} from './contexts/ChatEventBusContext/index.js';
export {SessionConfigProvider} from './contexts/SessionConfigContext/index.js';
export {SessionIdProvider} from './contexts/SessionIdContext/index.js';

// Hooks
export {useChatEventBus} from './hooks/useChatEventBus.js';
export {useMessageCount} from './hooks/useMessageCount.js';
export {useSessionConfig} from './hooks/useSessionConfig.js';
export {useSessionId} from './hooks/useSessionId.js';
export {useSessionTitle} from './hooks/useSessionTitle.js';
export {useStreamChat} from './hooks/useStreamChat.js';
export {useVscodeStatus} from './hooks/useVscodeStatus.js';

// Types
export type {
  ChatEventBus,
  ChatMessage,
} from './components/StreamingMessageDisplay/index.js';

// Styles
export {default as chatSessionStyles} from './styles.module.css';
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/modules/chat-session/index.ts
git commit -m "refactor: add chat-session module barrel export"
```

---

### Task 4: Update `ChatPage.tsx` imports

**Files:**

- Modify: `apps/frontend/src/pages/chat/ChatPage.tsx`

- [ ] **Step 1: Replace all imports to point at the module**

Replace the import block in `ChatPage.tsx`. Change:

```typescript
import {ChatPageView} from './ChatPageView.js';
import {ChatEventBusProvider} from './contexts/ChatEventBusContext/index.js';
import {SessionConfigProvider} from './contexts/SessionConfigContext/index.js';
import {SessionIdProvider} from './contexts/SessionIdContext/index.js';
import {useChatEventBus} from './hooks/useChatEventBus.js';
import {useMessageCount} from './hooks/useMessageCount.js';
import {useSessionConfig} from './hooks/useSessionConfig.js';
import {useSessionId} from './hooks/useSessionId.js';
import {useSessionTitle} from './hooks/useSessionTitle.js';
import {useStreamChat} from './hooks/useStreamChat.js';
import {useVscodeStatus} from './hooks/useVscodeStatus.js';
```

To:

```typescript
import {
  ChatEventBusProvider,
  SessionConfigProvider,
  SessionIdProvider,
  useChatEventBus,
  useMessageCount,
  useSessionConfig,
  useSessionId,
  useSessionTitle,
  useStreamChat,
  useVscodeStatus,
} from '@/modules/chat-session/index.js';

import {ChatPageView} from './ChatPageView.js';
```

- [ ] **Step 2: Pass route props to SessionIdProvider**

Update the `ChatPage` component JSX. Change:

```tsx
<SessionIdProvider>
```

To:

```tsx
<SessionIdProvider
  buildSessionRoute={(id) => `/chat/${id}`}
  baseRoute={ROUTES.chat()}
>
```

Add the ROUTES import if not already present:

```typescript
import {ROUTES} from '@/routes.js';
```

- [ ] **Step 3: Verify no other relative imports remain**

Check that `ChatPage.tsx` has no remaining `./contexts/`, `./hooks/`, or `./components/` imports (except `./ChatPageView.js` which is page-specific).

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/pages/chat/ChatPage.tsx
git commit -m "refactor: update ChatPage imports to use chat-session module"
```

---

### Task 5: Update `ChatPageView.tsx` imports

**Files:**

- Modify: `apps/frontend/src/pages/chat/ChatPageView.tsx`

- [ ] **Step 1: Replace all imports to point at the module**

Change:

```typescript
import {ChatAlert} from './components/ChatAlert/index.js';
import {ChatInput} from './components/ChatInput/index.js';
import {InfoBar} from './components/InfoBar/index.js';
import {SessionSetup} from './components/SessionSetup/index.js';
import {SessionSidebar} from './components/SessionSidebar/index.js';
import {
  type ChatEventBus,
  type ChatMessage,
  StreamingMessageDisplay,
} from './components/StreamingMessageDisplay/index.js';
import {TitleBarView} from './components/TitleBar/index.js';
import styles from './styles.module.css';
```

To:

```typescript
import {
  type ChatEventBus,
  type ChatMessage,
  ChatAlert,
  ChatInput,
  InfoBar,
  SessionSetup,
  SessionSidebar,
  StreamingMessageDisplay,
  TitleBarView,
  chatSessionStyles as styles,
} from '@/modules/chat-session/index.js';
```

- [ ] **Step 2: Verify no remaining relative imports to moved files**

The only remaining relative import should be none — `ChatPageView.tsx` imports everything from the module.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/pages/chat/ChatPageView.tsx
git commit -m "refactor: update ChatPageView imports to use chat-session module"
```

---

### Task 6: Update `CLAUDE.md`

**Files:**

- Modify: `apps/frontend/CLAUDE.md`

- [ ] **Step 1: Add modules/ documentation**

Add a new section after the existing "File Structure" section heading area, or at the end of the file. Add:

```markdown
## Directory Structure

- `components/` - Generic, business-agnostic UI components (e.g., `CollapsibleSidebar`, `MarkdownRenderer`).
- `modules/` - Domain-specific modules shared across multiple pages. Unlike `components/`, modules contain feature-specific logic, hooks, contexts, and components that belong to a particular business domain but are used by more than one page.
- `pages/` - Route entry points. Each page is a thin shell that composes modules.
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/CLAUDE.md
git commit -m "docs: document modules/ directory in frontend CLAUDE.md"
```

---

### Task 7: Build and test verification

**Files:** None (verification only)

- [ ] **Step 1: Type-check the entire frontend**

```bash
cd apps/frontend && bunx tsc --noEmit --pretty
```

Expected: no errors.

- [ ] **Step 2: Run all frontend tests**

```bash
cd apps/frontend && bun run test
```

Expected: all tests pass.

- [ ] **Step 3: Build the frontend**

```bash
cd apps/frontend && bun run build
```

Expected: build succeeds with no errors.

- [ ] **Step 4: Run lint**

```bash
cd apps/frontend && bun run lint
```

Expected: no lint errors.

- [ ] **Step 5: If any step fails, fix the issue**

Common issues:

- Stale relative imports in moved files that reference `@/pages/chat/...` — update to use relative paths within the module or `@/modules/chat-session/...`.
- Missing re-exports in the barrel `index.ts` — add them.
- CSS module import path issues — verify `styles.module.css` moved correctly.

- [ ] **Step 6: Final commit if fixes were needed**

```bash
git add -A apps/frontend/
git commit -m "fix: resolve import issues after chat-session module extraction"
```
