import type {
  SseMessageStartEvent,
  SseTextDeltaEvent,
  SseThinkingDeltaEvent,
  SseThinkingEndEvent,
  SseThinkingStartEvent,
  SseToolExecuteDeltaEvent,
  SseToolExecuteEndEvent,
  SseToolExecuteStartEvent,
  SseUsage,
} from '@omnicraft/sse-events';

import type {EventBus} from '@/helpers/event-bus.js';

/** Text content from the LLM or user input. */
export interface TextContent {
  type: 'text';
  content: string;
}

/** Thinking/reasoning content from the LLM. */
export interface ThinkingContent {
  type: 'thinking';
  content: string;
  done: boolean;
}

/** A single content entry in a chat message. */
export type MessageContent =
  | TextContent
  | ThinkingContent
  | SseToolExecuteStartEvent
  | SseToolExecuteEndEvent;

/** A chat message for UI rendering. Each message has exactly one content. */
export interface ChatMessage {
  id: string | null;
  createdAt: number | null;
  role: 'user' | 'assistant';
  content: MessageContent;
}

// ---------------------------------------------------------------------------
// Chat Event Bus
// ---------------------------------------------------------------------------

/** Event map for the chat page event bus. */
export interface ChatEventMap {
  /** User sent a message. */
  'user-message-sent': {content: string};
  /** A text token arrived from the LLM. */
  'text-delta': SseTextDeltaEvent;
  /** A message has started (metadata from backend). */
  'message-start': SseMessageStartEvent;
  /** A tool started executing. */
  'tool-execute-start': SseToolExecuteStartEvent;
  /** A tool finished executing. */
  'tool-execute-end': SseToolExecuteEndEvent;
  /** Intermediate streaming output from a running tool. */
  'tool-execute-delta': SseToolExecuteDeltaEvent;
  /** Thinking/reasoning has started. */
  'thinking-start': SseThinkingStartEvent;
  /** A thinking/reasoning content delta. */
  'thinking-delta': SseThinkingDeltaEvent;
  /** Thinking/reasoning has ended. */
  'thinking-end': SseThinkingEndEvent;
  /** The stream completed (LLM finished or max rounds reached). */
  'stream-done': {
    sessionId: string;
    userMessage: string;
    assistantMessage: string;
    reason: string;
    usage: SseUsage;
  };
  /** An error occurred during streaming. */
  'stream-error': {message: string};
  /** The stream ended (always fires in finally, regardless of outcome). */
  'stream-end': undefined;
}

/** Typed event bus for the chat page. */
export type ChatEventBus = EventBus<ChatEventMap>;
