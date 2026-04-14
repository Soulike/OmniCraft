import type {ThinkingLevel} from '@omnicraft/api-schema';
import type {
  SseDoneEvent,
  SseMessageStartEvent,
  SseTextDeltaEvent,
  SseThinkingDeltaEvent,
  SseThinkingEndEvent,
  SseThinkingStartEvent,
  SseToolExecuteDeltaEvent,
  SseToolExecuteEndEvent,
  SseToolExecuteStartEvent,
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

/** Subagent execution content. */
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

/** A single content entry in a chat message. */
export type MessageContent =
  | TextContent
  | ThinkingContent
  | SseToolExecuteStartEvent
  | SseToolExecuteEndEvent
  | SubagentContent;

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
  /** SSE done event pass-through. Universal for agent and subagent. */
  done: SseDoneEvent;
  /** Main agent turn completed. Carries session context for title generation. */
  'turn-done': {
    sessionId: string;
    userMessage: string;
    assistantMessage: string;
  };
  /** An error occurred during streaming. */
  'stream-error': {message: string};
  /** Reset all display state (messages, tool output). */
  reset: undefined;
  /** A subagent was dispatched. */
  'subagent-dispatched': {
    agentId: string;
    task: string;
    agentType: string;
    thinkingLevel: ThinkingLevel;
    workingDirectory: string;
    eventBus: ChatEventBus;
  };
  /** A subagent completed its work. */
  'subagent-completed': {
    agentId: string;
    status: 'success' | 'failure';
  };
}

/** Typed event bus for the chat page. */
export type ChatEventBus = EventBus<ChatEventMap>;
