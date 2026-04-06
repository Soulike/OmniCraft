import type {ChatMessage} from '../../types.js';
import {useMessageList} from './hooks/useMessageList.js';
import {MessageListView} from './MessageListView.js';

interface MessageListProps {
  messages: ChatMessage[];
  toolOutput: ReadonlyMap<string, string>;
}

/**
 * Container component for the message list.
 * Transforms ChatMessage[] into render items via the view-model hook,
 * then delegates rendering to MessageListView.
 */
export function MessageList({messages, toolOutput}: MessageListProps) {
  const items = useMessageList(messages);
  return <MessageListView items={items} toolOutput={toolOutput} />;
}
