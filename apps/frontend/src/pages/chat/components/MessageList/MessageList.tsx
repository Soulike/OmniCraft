import type {ChatMessage} from '../../types.js';
import {useMessageList} from './hooks/useMessageList.js';
import {MessageListView} from './MessageListView.js';

interface MessageListProps {
  messages: ChatMessage[];
}

/**
 * Container component for the message list.
 * Transforms ChatMessage[] into render items via the view-model hook,
 * then delegates rendering to MessageListView.
 */
export function MessageList({messages}: MessageListProps) {
  const items = useMessageList(messages);
  return <MessageListView items={items} />;
}
