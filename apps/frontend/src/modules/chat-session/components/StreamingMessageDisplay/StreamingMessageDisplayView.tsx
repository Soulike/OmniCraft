import {MessageList} from './components/MessageList/index.js';
import type {ChatMessage} from './types.js';

interface StreamingMessageDisplayViewProps {
  messages: ChatMessage[];
}

export function StreamingMessageDisplayView({
  messages,
}: StreamingMessageDisplayViewProps) {
  if (messages.length === 0) return null;
  return <MessageList messages={messages} />;
}
