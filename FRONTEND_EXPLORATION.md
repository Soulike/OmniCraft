# OmniCraft Frontend Codebase Exploration

## 1. Overall Frontend Structure

### Directory Layout

```
apps/frontend/
├── src/
│   ├── api/                    # API client layer
│   │   ├── chat/               # Chat API functions
│   │   ├── helpers/            # SSE parsing utilities
│   │   └── settings/           # Settings API
│   ├── components/             # Reusable components
│   │   ├── Loading/
│   │   └── LoadError/
│   ├── contexts/               # React context providers
│   │   └── theme/              # Theme management
│   ├── hooks/                  # Custom React hooks
│   │   ├── useAutoScroll.ts
│   │   ├── useMatchMedia.ts
│   │   └── useTheme.ts
│   ├── pages/                  # Page components
│   │   ├── _layout/            # Root layout
│   │   ├── chat/               # Chat page (PRIMARY FOCUS)
│   │   ├── settings/           # Settings page
│   │   └── loading/            # Loading page
│   ├── router/                 # React Router configuration
│   ├── contexts/               # React Context providers
│   ├── main.tsx                # Entry point
│   ├── index.css               # Global styles
│   └── routes.ts               # Route definitions
├── package.json
├── vite.config.ts              # Vite configuration
├── tsconfig.json               # TypeScript config
└── CLAUDE.md                   # Frontend development guide
```

### Tech Stack

- **Framework**: React 19.2.4 with React Router 7.13.1
- **Build Tool**: Vite 8.0.1
- **Language**: TypeScript
- **UI Library**: HeroUI React v3.0.1
- **Styling**: CSS Modules + Tailwind CSS v4.2.2
- **Testing**: Vitest 4.1.0
- **Icons**: lucide-react 0.577.0
- **Validation**: Zod 4.3.6
- **Other**: Bun (package manager only)

---

## 2. Chat Page Implementation (`src/pages/chat/`)

### Architecture: MVVM Pattern

The chat page follows strict MVVM (Model-View-View Model) separation:

```
ChatPage.tsx          ← Container: Composes hooks and passes to view
├─ useStreamChat      ← ViewModel: Orchestrates SSE streaming
├─ useMessages        ← ViewModel: Manages message state
├─ useSession         ← ViewModel: Manages session lifecycle
└─ useAutoScroll      ← ViewModel: Auto-scroll behavior

ChatPageView.tsx      ← Pure View: Receives all props, no state
```

### File Structure

#### 1. **ChatPage.tsx** (Container Component)

```typescript
export function ChatPage() {
  const {sessionId, sessionError, clearSessionError} = useSession();
  const {messages, addUserMessage, appendToLastAssistantMessage, ...} = useMessages();
  const {isStreaming, streamError, sendMessage, clearStreamError} = useStreamChat({...});
  const scrollRef = useAutoScroll();

  return <ChatPageView {...allProps} />;
}
```

**Responsibilities:**

- Composes all view model hooks
- Manages error state (session + stream)
- Provides scroll ref to message container
- Passes `onSend` callback to input

#### 2. **ChatPageView.tsx** (Stateless View)

```typescript
export function ChatPageView({
  messages: ChatMessage[],
  isInputDisabled: boolean,
  error: string | null,
  scrollRef: RefObject<HTMLDivElement>,
  onSend: (content: string) => void,
  onDismissError: () => void,
})
```

**Responsibilities:**

- Renders error alert (HeroUI Alert component)
- Renders message list wrapper
- Renders chat input
- No logic, only presentational

#### 3. **types.ts** (Type Definitions)

```typescript
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}
```

Simple type for UI rendering. No tool information stored here yet.

---

## 3. Chat Page Hooks (View Models)

### Hook 1: `useSession()`

**Purpose**: Manages chat session lifecycle

```typescript
export function useSession() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const initRef = useRef(false);

  const resetSession = useCallback(async () => {
    try {
      const id = await createSession();
      setSessionId(id);
      return id;
    } catch (e) {
      setError(/* error message */);
      return null;
    }
  }, []);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    void resetSession();
  }, [resetSession]);

  return {sessionId, sessionError: error, resetSession, clearSessionError};
}
```

**Key Points:**

- Initializes a session on mount (using initRef to prevent double-init)
- Stores session ID for subsequent API calls
- Tracks session creation errors
- Provides `resetSession()` for manual session recreation

---

### Hook 2: `useMessages()`

**Purpose**: Manages message history state

```typescript
export function useMessages() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const addUserMessage = useCallback((userMessage: ChatMessage) => {
    setMessages((prev) => [
      ...prev,
      userMessage,
      {role: 'assistant' as const, content: ''}, // Placeholder for stream
    ]);
  }, []);

  const appendToLastAssistantMessage = useCallback((token: string) => {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last.role !== 'assistant') {
        throw new Error(
          'Cannot append: last message is not an assistant message',
        );
      }
      return [...prev.slice(0, -1), {...last, content: last.content + token}];
    });
  }, []);

  const removeLastAssistantMessageIfEmpty = useCallback(() => {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last.role === 'assistant' && last.content === '') {
        return prev.slice(0, -1); // Remove empty placeholder
      }
      return prev;
    });
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    addUserMessage,
    appendToLastAssistantMessage,
    removeLastAssistantMessageIfEmpty,
    clearMessages,
  };
}
```

**Key Points:**

- User message + empty assistant placeholder added in single state update
- Prevents race conditions with streaming
- `appendToLastAssistantMessage` concatenates tokens character-by-character
- `removeLastAssistantMessageIfEmpty` cleans up empty placeholders on error/done

---

### Hook 3: `useStreamChat()`

**Purpose**: Orchestrates sending messages and consuming SSE stream

```typescript
export function useStreamChat({
  sessionId,
  addUserMessage,
  appendToLastAssistantMessage,
  removeLastAssistantMessageIfEmpty,
}: UseStreamChatOptions) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);

  const sendMessage = useCallback(
    async (content: string) => {
      if (isStreaming || !sessionId) return;

      const trimmed = content.trim();
      if (!trimmed) return;

      setStreamError(null);
      setIsStreaming(true);

      const userMessage: ChatMessage = {role: 'user', content: trimmed};
      addUserMessage(userMessage);

      try {
        const stream = streamChatCompletion(sessionId, trimmed);

        for await (const event of stream) {
          switch (event.type) {
            case 'text-delta':
              appendToLastAssistantMessage(event.content);
              break;
            case 'tool-execute-start':
            case 'tool-execute-end':
              // Tool execution events are not rendered in the UI yet.
              break;
            case 'done':
              removeLastAssistantMessageIfEmpty();
              break;
            case 'error':
              removeLastAssistantMessageIfEmpty();
              setStreamError(event.message);
              break;
          }
        }
      } catch (e) {
        console.error('Chat completion failed', e);
        removeLastAssistantMessageIfEmpty();
        const message =
          e instanceof Error ? e.message : 'An unexpected error occurred';
        setStreamError(message);
      } finally {
        setIsStreaming(false);
      }
    },
    [
      isStreaming,
      sessionId,
      addUserMessage,
      appendToLastAssistantMessage,
      removeLastAssistantMessageIfEmpty,
    ],
  );

  const clearStreamError = useCallback(() => {
    setStreamError(null);
  }, []);

  return {isStreaming, streamError, sendMessage, clearStreamError};
}
```

**Key Points:**

- Consumes async generator from `streamChatCompletion()`
- Handles 5 event types: `text-delta`, `tool-execute-start`, `tool-execute-end`, `done`, `error`
- Tool events currently ignored (no UI rendering)
- Error handling: removes empty placeholder, captures error message
- Prevents concurrent sends with `isStreaming` flag
- Validates `sessionId` before sending

---

## 4. SSE Streaming Implementation

### Flow Diagram

```
ChatInput.onSend()
  ↓
useStreamChat.sendMessage()
  ↓
streamChatCompletion(sessionId, message)  [in api/chat/chat.ts]
  ├─ POST /api/chat/session/{sessionId}/completions
  ├─ fetch() with Response.body stream
  ├─ parseSseStream(response)  [in api/helpers/sse.ts]
  └─ for await (const event of stream)  [AsyncGenerator<SseEvent>]
      ↓
useStreamChat handles events
  ├─ text-delta → appendToLastAssistantMessage(event.content)
  ├─ tool-execute-start/end → ignored (for now)
  ├─ done → removeLastAssistantMessageIfEmpty()
  └─ error → removeLastAssistantMessageIfEmpty() + setStreamError()
```

### API Layer: `src/api/chat/chat.ts`

#### `createSession()`

```typescript
export async function createSession(): Promise<string> {
  const res = await fetch(`${BASE}/session`, {method: 'POST'});

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Failed to create session (${res.status.toString()}): ${body}`,
    );
  }

  const json: unknown = await res.json();
  const {sessionId} = createSessionResponse.parse(json);
  return sessionId;
}
```

#### `streamChatCompletion()`

```typescript
export async function* streamChatCompletion(
  sessionId: string,
  message: string,
): AsyncGenerator<SseEvent, void, undefined> {
  const res = await fetch(`${BASE}/session/${sessionId}/completions`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({message}),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Chat request failed (${res.status.toString()}): ${body}`);
  }

  for await (const data of parseSseStream(res)) {
    const parsed: unknown = JSON.parse(data);
    yield sseEventSchema.parse(parsed);
  }
}
```

**Key Points:**

- Uses fetch with ReadableStream (EventSource doesn't support POST)
- Each SSE data packet contains JSON-stringified SseEvent
- parseSseStream handles low-level SSE parsing
- sseEventSchema validates and types the parsed event
- Returns AsyncGenerator for consumer to iterate with `for await`

### SSE Parsing: `src/api/helpers/sse.ts`

This is a robust, low-level SSE parser:

```typescript
export async function* parseSseStream(
  response: Response,
): AsyncGenerator<string, void, undefined>
```

**Process:**

1. Gets ReadableStream from response.body
2. Pipes through TextDecoderStream (bytes → text)
3. Buffers across chunk boundaries (chunks may split events)
4. Splits on `\n\n` (SSE event delimiter)
5. For each event:
   - Validates every line starts with known SSE prefix
   - Extracts all `data:` field values
   - Joins multi-line data with `\n`
6. Yields raw data strings (not parsed JSON yet)

**Validations:**

- Rejects unknown SSE field prefixes early (strict mode)
- Normalizes line endings: `\r\n`, `\r`, `\n` → `\n`
- Handles both `data:` and `data: ` (optional space)
- Rejects leading whitespace on lines
- Throws on malformed events with preview (max 120 chars)

**Known SSE Fields:**

```typescript
const SSE_FIELD_PREFIXES = {
  data: 'data:',
  event: 'event:',
  id: 'id:',
  retry: 'retry:',
  comment: ':',
};
```

**Testing:**

- 50+ test cases covering:
  - Single/multiple events
  - Buffering across arbitrary chunk boundaries
  - Empty lines and whitespace
  - CRLF/CR/LF line endings
  - Large payloads (100K+ chars)
  - Malformed streams
  - Character-by-character chunks

---

### Event Types: `packages/sse-events/src/schema.ts`

```typescript
// Text delta from LLM
export const sseTextDeltaEventSchema = z.object({
  type: z.literal('text-delta'),
  content: z.string(),
});

// Tool execution start
export const sseToolExecuteStartEventSchema = z.object({
  type: z.literal('tool-execute-start'),
  callId: z.string(),
  toolName: z.string(),
  arguments: z.string(),
});

// Tool execution end
export const sseToolExecuteEndEventSchema = z.object({
  type: z.literal('tool-execute-end'),
  callId: z.string(),
  result: z.string(),
  isError: z.boolean(),
});

// Stream done
export const sseDoneEventSchema = z.object({
  type: z.literal('done'),
  reason: z.enum(['complete', 'max_rounds_reached']),
});

// Error occurred
export const sseErrorEventSchema = z.object({
  type: z.literal('error'),
  message: z.string(),
});

// Union of all types
export const sseEventSchema = z.discriminatedUnion('type', [
  sseTextDeltaEventSchema,
  sseToolExecuteStartEventSchema,
  sseToolExecuteEndEventSchema,
  sseDoneEventSchema,
  sseErrorEventSchema,
]);

export type SseEvent = z.infer<typeof sseEventSchema>;
```

---

## 5. Message Rendering

### Message List Component: `MessageList.tsx`

```typescript
export function MessageList({messages}: MessageListProps) {
  if (messages.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyText}>Send a message to start chatting.</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.list}>
        {messages.map((message, index) => (
          <div
            key={index}
            className={
              message.role === 'user'
                ? styles.userMessage
                : styles.assistantMessage
            }
          >
            <MessageBubble message={message} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Layout:**

- Empty state: centered message
- Non-empty: flex column with 12px gap
- User messages: aligned right, max-width 80%
- Assistant messages: aligned left, max-width 80%

### Message Bubble Component: `MessageBubble.tsx`

```typescript
export function MessageBubble({message}: MessageBubbleProps) {
  const {displayedContent} = useStreamingText(message.content);

  const content =
    message.role === 'assistant' ? displayedContent : message.content;

  return <MessageBubbleView role={message.role} content={content} />;
}
```

**Responsibilities:**

- Uses `useStreamingText` hook for animation
- Only animates assistant messages
- User messages shown instantly

### Message Bubble View: `MessageBubbleView.tsx`

```typescript
export function MessageBubbleView({role, content}: MessageBubbleViewProps) {
  return (
    <div className={clsx(styles.bubble, {
      [styles.user]: role === 'user',
      [styles.assistant]: role === 'assistant',
    })}>
      <div className={styles.content}>
        {content || <Skeleton className={styles.skeleton} />}
      </div>
    </div>
  );
}
```

**Features:**

- Conditional styling by role
- Shows HeroUI Skeleton while content is empty
- Preserves whitespace with `white-space: pre-wrap`
- Word-wrapping enabled

### Streaming Text Animation: `useStreamingText.ts`

```typescript
const CHARS_PER_FRAME = 2;

export function useStreamingText(fullContent: string): UseStreamingTextResult {
  const [displayedLength, setDisplayedLength] = useState(fullContent.length);
  const displayedLengthRef = useRef(displayedLength);
  const targetLengthRef = useRef(fullContent.length);
  const animationFrameIdRef = useRef(0);
  const isLoopRunningRef = useRef(false);
  const previousFullContentRef = useRef(fullContent);

  const startLoop = useCallback(() => {
    if (isLoopRunningRef.current) return;
    isLoopRunningRef.current = true;

    const tick = () => {
      setDisplayedLength((prev) => {
        const next = Math.min(prev + CHARS_PER_FRAME, targetLengthRef.current);
        displayedLengthRef.current = next;
        return next;
      });

      if (displayedLengthRef.current < targetLengthRef.current) {
        animationFrameIdRef.current = requestAnimationFrame(tick);
      } else {
        isLoopRunningRef.current = false;
      }
    };

    animationFrameIdRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    const previousFullContent = previousFullContentRef.current;

    if (!fullContent.startsWith(previousFullContent)) {
      // Content replaced, show instantly
      cancelAnimationFrame(animationFrameIdRef.current);
      isLoopRunningRef.current = false;
      setDisplayedLength(fullContent.length);
      displayedLengthRef.current = fullContent.length;
      targetLengthRef.current = fullContent.length;
    } else if (fullContent.length > targetLengthRef.current) {
      // Content appended, animate new chars
      targetLengthRef.current = fullContent.length;
      startLoop();
    }

    previousFullContentRef.current = fullContent;
  }, [fullContent, startLoop]);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(animationFrameIdRef.current);
    };
  }, []);

  return {
    displayedContent: fullContent.slice(0, displayedLength),
    isAnimating: displayedLength < fullContent.length,
  };
}
```

**Key Points:**

- Animates at 2 characters per frame (60fps)
- Content present at mount: shown instantly
- Content appended during streaming: animated
- Content replaced: shown instantly (not appended)
- Uses requestAnimationFrame for smooth animation
- Cleans up animation on unmount

---

## 6. Chat Input Component

### ChatInput.tsx (Container)

```typescript
export function ChatInput({onSend, isDisabled}: ChatInputProps) {
  const [input, setInput] = useState('');

  const handleSend = useCallback(() => {
    if (!input.trim()) return;
    onSend(input);
    setInput('');
  }, [input, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <ChatInputView
      input={input}
      isDisabled={isDisabled}
      onInputChange={setInput}
      onKeyDown={handleKeyDown}
      onSend={handleSend}
    />
  );
}
```

### ChatInputView.tsx (View)

```typescript
export function ChatInputView({
  input,
  isDisabled,
  onInputChange,
  onKeyDown,
  onSend,
}: ChatInputViewProps) {
  return (
    <div className={styles.container}>
      <TextArea
        aria-label='Chat message'
        className={styles.textarea}
        placeholder='Type a message... (Enter to send, Shift+Enter for newline)'
        rows={1}
        value={input}
        disabled={isDisabled}
        onChange={(e) => {
          onInputChange(e.target.value);
        }}
        onKeyDown={onKeyDown}
      />
      <Button
        aria-label='Send message'
        isDisabled={!input.trim() || isDisabled}
        isIconOnly
        onPress={onSend}
      >
        <SendIcon size={18} />
      </Button>
    </div>
  );
}
```

**Features:**

- HeroUI TextArea for input
- HeroUI Button with lucide-react SendIcon
- Enter to send (Shift+Enter for newline)
- Send button disabled if input empty or form disabled
- Flex layout: textarea flexible, button square

---

## 7. HeroUI Usage

### Components Used:

1. **Alert** - Error messages

   ```typescript
   <Alert status='danger'>
     <Alert.Indicator />
     <Alert.Content>
       <Alert.Title>Error</Alert.Title>
       <Alert.Description>{error}</Alert.Description>
     </Alert.Content>
     <CloseButton onPress={onDismissError} />
   </Alert>
   ```

2. **CloseButton** - Close button in alerts
3. **TextArea** - Chat input field
4. **Button** - Send button
5. **Skeleton** - Loading placeholder for messages

### Theme Integration:

- HeroUI v3 with Tailwind CSS v4
- Dark/Light mode support (via ThemeProvider)
- CSS variables for colors: `--accent`, `--surface`, `--foreground`, `--border`

---

## 8. Styling & CSS Modules Pattern

### CSS Variables (HeroUI Theme)

```css
--accent              /* Primary action color */
--accent-foreground   /* Text on accent background */
--surface             /* Secondary/surface background */
--foreground          /* Primary text color */
--border              /* Border color */
--muted               /* Muted/secondary text */
```

### CSS Module Files:

#### `src/pages/chat/styles.module.css`

```css
.page {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.messageListWrapper {
  flex: 1;
  min-height: 0; /* Important for nested overflow */
  overflow-y: auto;
  height: 100%;
}
```

#### `src/pages/chat/components/MessageList/styles.module.css`

```css
.container {
  padding: 16px;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.userMessage {
  align-self: flex-end;
  max-width: 80%;
}

.assistantMessage {
  align-self: flex-start;
  max-width: 80%;
}

.empty {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.emptyText {
  color: var(--muted);
}
```

#### `src/pages/chat/components/MessageList/components/MessageBubble/styles.module.css`

```css
.bubble {
  padding: 10px 16px;
  border-radius: 16px;
  word-wrap: break-word;
  white-space: pre-wrap; /* Preserve whitespace */
}

.user {
  background: var(--accent);
  color: var(--accent-foreground);
  border-bottom-right-radius: 4px;
}

.assistant {
  background: var(--surface);
  color: var(--foreground);
  border-bottom-left-radius: 4px;
}

.content {
  line-height: 1.5;
}

.skeleton {
  height: 1em;
  width: 8em;
  border-radius: 4px;
}
```

#### `src/pages/chat/components/ChatInput/styles.module.css`

```css
.container {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 16px;
  border-top: 1px solid var(--border);
}

.textarea {
  flex: 1;
  resize: none;
}
```

### Styling Principles (from CLAUDE.md):

- ✅ CSS Modules for custom styles
- ✅ HeroUI components for UI
- ❌ NO Tailwind utility classes in custom components
- ❌ NO margin/layout properties on inner divs (parent controls layout)
- Use `clsx()` for conditional classes

---

## 9. Existing Tool-Call Handling in Frontend

### Current Implementation:

- **NOT YET RENDERED**: Tool events are received but ignored
- In `useStreamChat.ts` lines 48-51:
  ```typescript
  case 'tool-execute-start':
  case 'tool-execute-end':
    // Tool execution events are not rendered in the UI yet.
    break;
  ```

### Event Types Available (from SSE schema):

**tool-execute-start**

```typescript
{
  type: 'tool-execute-start',
  callId: string,
  toolName: string,
  arguments: string,  // JSON-stringified
}
```

**tool-execute-end**

```typescript
{
  type: 'tool-execute-end',
  callId: string,
  result: string,     // JSON-stringified or error message
  isError: boolean,
}
```

### Current Message Model:

```typescript
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}
```

**Limitation**: No structured data for tool calls, only `content` string.

---

## 10. Key Architectural Patterns

### 1. MVVM Component Structure

- **Container** (ChatPage.tsx): Orchestrates hooks, manages composition
- **Hooks**: Pure business logic (useStreamChat, useMessages, useSession)
- **View** (ChatPageView.tsx): Stateless, receives all props

### 2. Async Generator for Streaming

- `streamChatCompletion()` returns `AsyncGenerator<SseEvent>`
- Consumed with `for await` loop in `useStreamChat`
- Clean, composable pattern

### 3. SSE Parsing Strategy

- Low-level: `parseSseStream()` handles raw SSE protocol
- Mid-level: `streamChatCompletion()` parses JSON & validates schema
- High-level: `useStreamChat()` handles business logic (state updates)
- Clean separation of concerns

### 4. Message Rendering

- `useStreamingText()` animates assistant messages
- User messages shown instantly
- Animation driven by `requestAnimationFrame`

### 5. Error Handling

- Session errors (initialization)
- Stream errors (API failures)
- Graceful cleanup (remove empty placeholder on error)
- User-dismissible error alerts

---

## 11. Data Flow Diagram

```
User Types Message
  ↓
ChatInput.handleSend()
  ↓
useStreamChat.sendMessage(content)
  ├─ addUserMessage(userMessage)  → useMessages updates state
  ├─ createUserMessage
  ├─ streamChatCompletion(sessionId, message)
  │   ├─ fetch POST /api/chat/session/{id}/completions
  │   ├─ parseSseStream(response)
  │   └─ for await (const data of parseSseStream)
  │       └─ JSON.parse(data) + sseEventSchema.parse()
  │
  ├─ for await (const event of stream)
  │   ├─ text-delta → appendToLastAssistantMessage(token)
  │   │                 → useMessages updates message content
  │   │                 → component re-renders
  │   │                 → useStreamingText animates it
  │   ├─ tool-execute-start → ignored
  │   ├─ tool-execute-end → ignored
  │   ├─ done → removeLastAssistantMessageIfEmpty()
  │   └─ error → removeLastAssistantMessageIfEmpty() + setStreamError()
  │
  └─ ChatPageView re-renders with updated messages
      └─ MessageList maps messages
          └─ MessageBubble with useStreamingText animation
```

---

## 12. Session Management

### Session Flow:

1. **Mount**: `useSession()` creates session on component mount
2. **Store**: Session ID stored in React state
3. **Use**: Passed to `streamChatCompletion(sessionId, message)`
4. **Error**: Session creation failures set error state
5. **Reset**: `resetSession()` available for manual recreation

### API Calls:

- `POST /api/chat/session` → returns `{sessionId: string}`
- `POST /api/chat/session/{id}/completions` → SSE stream

---

## 13. Critical Component Connections

```
main.tsx
  ↓
ThemeProvider (context)
  ↓
RouterProvider
  ↓
Layout (_layout component)
  ↓
ChatPage (route: /chat)
  ├─ useSession()
  ├─ useMessages()
  ├─ useStreamChat()
  ├─ useAutoScroll()
  └─ ChatPageView
      ├─ Alert (error display)
      ├─ MessageList (scroll container)
      │  └─ MessageBubble[] (with useStreamingText)
      └─ ChatInput
          ├─ TextArea (HeroUI)
          └─ Button (HeroUI)
```

---

## 14. Important Files Summary

| File                                                             | Purpose                     | Key Exports                                 |
| ---------------------------------------------------------------- | --------------------------- | ------------------------------------------- |
| `ChatPage.tsx`                                                   | Container, hook composition | `ChatPage`                                  |
| `ChatPageView.tsx`                                               | Stateless view              | `ChatPageView`                              |
| `types.ts`                                                       | Message type                | `ChatMessage`                               |
| `hooks/useStreamChat.ts`                                         | SSE orchestration           | `useStreamChat()`                           |
| `hooks/useMessages.ts`                                           | Message state management    | `useMessages()`                             |
| `hooks/useSession.ts`                                            | Session lifecycle           | `useSession()`                              |
| `components/MessageList/MessageList.tsx`                         | Message list view           | `MessageList`                               |
| `components/MessageList/MessageBubble/MessageBubble.tsx`         | Single message              | `MessageBubble`                             |
| `components/MessageList/MessageBubble/hooks/useStreamingText.ts` | Text animation              | `useStreamingText()`                        |
| `components/ChatInput/ChatInput.tsx`                             | Input container             | `ChatInput`                                 |
| `components/ChatInput/ChatInputView.tsx`                         | Input view                  | `ChatInputView`                             |
| `api/chat/chat.ts`                                               | API functions               | `createSession()`, `streamChatCompletion()` |
| `api/helpers/sse.ts`                                             | SSE parsing                 | `parseSseStream()`                          |
| `api/chat/validator.ts`                                          | Zod schemas                 | `sseEventSchema`, `createSessionResponse`   |

---

## 15. Development Notes

### Package Manager

- Uses **Bun** (only as package manager)
- Use Node.js APIs in code, not Bun APIs

### TypeScript Configuration

- Strict mode enabled
- Path aliases: `@/` → `src/`

### Testing

- Vitest for unit tests
- SSE parser thoroughly tested (50+ cases)

### Code Style

- Google TypeScript Guide
- MVVM pattern enforced
- One component per file
- CSS Modules for styling
- No default exports (named exports only)

### Import Conventions

- Public modules: Use `@/` alias
- Component-internal modules: Use relative imports
- Always import from `index.ts` (allows lazy loading)

---

## Summary

The OmniCraft frontend is a **React 19 + Vite** application with clean architectural patterns:

1. **MVVM Structure**: Separates container (hooks), business logic (hooks), and view components
2. **Robust SSE Streaming**: Low-level parser, mid-level validation, high-level state management
3. **Smooth UX**: Character-by-character animation, proper error handling, auto-scroll
4. **HeroUI Components**: Modern UI library (v3) with dark/light theme support
5. **CSS Modules**: Scoped styling without utility classes
6. **Ready for Tool Calls**: Event types defined, handlers stubbed (not yet rendered)

The codebase is production-ready with comprehensive test coverage for critical SSE parsing logic. Tool-call rendering is the next feature to implement.
