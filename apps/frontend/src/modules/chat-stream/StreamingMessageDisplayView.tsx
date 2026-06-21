import type {ChatMessage} from '@/modules/chat-events/index.js';

import {MessageList} from './components/MessageList/index.js';

interface StreamingMessageDisplayViewProps {
  messages: ChatMessage[];
}

export function StreamingMessageDisplayView({
  messages,
}: StreamingMessageDisplayViewProps) {
  if (messages.length === 0) return null;
  return <MessageList messages={messages} />;
}
