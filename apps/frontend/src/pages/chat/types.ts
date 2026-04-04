import type {SseUsage} from '@omnicraft/sse-events';

import type {EventBus} from '@/helpers/event-bus.js';

/** Text content from the LLM or user input. */
export interface TextContent {
  type: 'text';
  content: string;
}

/** A tool has started executing. */
export interface ToolExecutionStartContent {
  type: 'tool-execution-start';
  callId: string;
  toolName: string;
  displayName: string;
  arguments: string;
}

/** A tool has finished executing. */
export interface ToolExecutionEndContent {
  type: 'tool-execution-end';
  callId: string;
  result: string;
  isError: boolean;
}

/** A single content entry in a chat message. */
export type MessageContent =
  | TextContent
  | ToolExecutionStartContent
  | ToolExecutionEndContent;

/** A chat message for UI rendering. Each message has exactly one content. */
export interface ChatMessage {
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
  'text-delta': {content: string};
  /** A tool started executing. */
  'tool-execute-start': ToolExecutionStartContent;
  /** A tool finished executing. */
  'tool-execute-end': ToolExecutionEndContent;
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
