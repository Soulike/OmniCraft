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
