import {useCallback, useState} from 'react';

import type {ChatMessage} from '@/modules/chat-stream/index.js';

/**
 * Tracks message count via an onMessagesChange callback
 * suitable for passing to StreamingMessageDisplay.
 */
export function useMessageCount() {
  const [messageCount, setMessageCount] = useState(0);

  const onMessagesChange = useCallback((messages: readonly ChatMessage[]) => {
    setMessageCount(messages.length);
  }, []);

  return {messageCount, onMessagesChange};
}
