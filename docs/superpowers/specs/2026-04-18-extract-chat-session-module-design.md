# Extract `modules/chat-session/` from Chat Page

**Date:** 2026-04-18
**Scope:** Frontend only, no user-facing changes

## Goal

Move shared chat-session components, contexts, hooks, and helpers out of
`pages/chat/` into `src/modules/chat-session/` so that future agent pages
(e.g., coding) can reuse them by composition.

This is a pure structural refactoring. The chat page continues to work
exactly as before.

## What Is `modules/`

A new top-level directory under `src/` for **domain-specific, cross-page
modules**. Unlike `components/` (generic, business-agnostic UI) or `pages/`
(route entry points), `modules/` contains feature logic shared across
multiple pages.

Each module follows the same internal structure as a component
(`components/`, `hooks/`, `contexts/`, `helpers/`, `index.ts`).

## What Moves

### Components

All of these move from `pages/chat/components/` to
`modules/chat-session/components/`:

- `StreamingMessageDisplay/` (entire subtree including MessageList,
  MessageBubble, ToolExecutionCard, ThinkingBlock, AskUserCard,
  SubagentDisclosure)
- `ChatInput/`
- `SessionSidebar/`
- `TitleBar/`
- `InfoBar/`
- `SessionSetup/`
- `UsageInfo/`
- `ChatAlert/`

### Contexts

All move from `pages/chat/contexts/` to `modules/chat-session/contexts/`:

- `ChatEventBusContext/`
- `SessionIdContext/`
- `SessionConfigContext/`

### Hooks

All move from `pages/chat/hooks/` to `modules/chat-session/hooks/`:

- `useChatEventBus.ts`
- `useMessageCount.ts`
- `useSessionConfig.ts`
- `useSessionId.ts`
- `useSessionTitle.ts`
- `useStreamChat.ts`
- `useVscodeStatus.ts`

### Helpers

Move from `pages/chat/helpers/` to `modules/chat-session/helpers/`:

- `route-base-event-to-bus.ts`
- `route-base-event-to-bus.test.ts`

### Styles

Move `pages/chat/styles.module.css` to `modules/chat-session/styles.module.css`
(this contains the shared layout styles used by `ChatPageView`).

## What Stays in `pages/chat/`

- `index.ts` - Page export with `React.lazy()`
- `ChatPage.tsx` - Provider composition + hook wiring (container)
- `ChatPageView.tsx` - Layout shell importing from `@/modules/chat-session`

These files keep their current logic but update import paths to point at
`@/modules/chat-session`.

## Module Public API

`modules/chat-session/index.ts` re-exports everything the page needs:

```typescript
// Components
export {StreamingMessageDisplay} from './components/StreamingMessageDisplay/index.js';
export {ChatInput} from './components/ChatInput/index.js';
export {SessionSidebar} from './components/SessionSidebar/index.js';
export {TitleBarView} from './components/TitleBar/index.js';
export {InfoBar} from './components/InfoBar/index.js';
export {SessionSetup} from './components/SessionSetup/index.js';
export {ChatAlert} from './components/ChatAlert/index.js';

// Contexts (providers)
export {ChatEventBusProvider} from './contexts/ChatEventBusContext/index.js';
export {SessionIdProvider} from './contexts/SessionIdContext/index.js';
export {SessionConfigProvider} from './contexts/SessionConfigContext/index.js';

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

## Resulting File Structure

```
src/
  modules/
    chat-session/
      index.ts                    # Public API
      styles.module.css           # Shared layout styles
      components/
        ChatAlert/
        ChatInput/
        InfoBar/
        SessionSetup/
        SessionSidebar/
        StreamingMessageDisplay/  # Full subtree
        TitleBar/
        UsageInfo/
      contexts/
        ChatEventBusContext/
        SessionConfigContext/
        SessionIdContext/
      hooks/
        useChatEventBus.ts
        useMessageCount.ts
        useSessionConfig.ts
        useSessionId.ts
        useSessionTitle.ts
        useStreamChat.ts
        useVscodeStatus.ts
      helpers/
        route-base-event-to-bus.ts
        route-base-event-to-bus.test.ts

  pages/
    chat/
      index.ts                    # React.lazy() export
      ChatPage.tsx                # Providers + hook wiring
      ChatPageView.tsx            # Layout, imports from @/modules/chat-session
```

## Provider Parameterization

Most providers are fully generic and need no changes. The one exception:

### `SessionIdProvider`

Currently hardcodes two navigation paths:

- `navigate('/chat/${id}')` on session creation (line 41)
- `navigate(ROUTES.chat())` on session clear (line 54)

A future coding page would need `/coding/${id}` and `ROUTES.coding()`
instead. To make this reusable, `SessionIdProvider` will accept props for
route construction:

```typescript
interface SessionIdProviderProps {
  children: React.ReactNode;
  /** Build the route for a given session ID. e.g. (id) => `/chat/${id}` */
  buildSessionRoute: (sessionId: string) => string;
  /** Route to navigate to when clearing the session. e.g. '/chat' */
  baseRoute: string;
}
```

The chat page passes:

```tsx
<SessionIdProvider
  buildSessionRoute={(id) => `/chat/${id}`}
  baseRoute={ROUTES.chat()}
>
```

This is the only provider that needs parameterization.
`ChatEventBusProvider` and `SessionConfigProvider` have no page-specific
logic and work as-is.

## Import Path Updates

All internal imports within the moved files that use `@/` aliases pointing
to `pages/chat/...` paths must be updated. Relative imports between files
that move together remain unchanged.

`ChatPage.tsx` and `ChatPageView.tsx` update their imports from relative
paths like `./components/ChatInput/index.js` to
`@/modules/chat-session` (the barrel export).

## CLAUDE.md Update

Add `modules/` to the frontend CLAUDE.md's project structure documentation
to explain its purpose:

> `modules/` contains domain-specific modules shared across multiple pages.
> Unlike `components/` (generic, business-agnostic UI), modules contain
> feature-specific logic, hooks, contexts, and components that belong to a
> particular business domain but are used by more than one page.

## Verification

- App builds without errors (`bun run build` in frontend)
- All existing tests pass
- Chat page functions identically (manual check)
- No circular dependencies introduced
