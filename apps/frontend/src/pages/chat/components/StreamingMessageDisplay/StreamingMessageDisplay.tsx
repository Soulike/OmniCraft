import {useEffect, useLayoutEffect, useRef} from 'react';

import {ChatEventBusProvider} from './contexts/ChatEventBusContext/index.js';
import {ToolOutputProvider} from './contexts/ToolOutputContext/index.js';
import {useMessages} from './hooks/useMessages.js';
import {StreamingMessageDisplayView} from './StreamingMessageDisplayView.js';
import type {ChatEventBus, ChatMessage} from './types.js';

interface StreamingMessageDisplayProps {
  eventBus: ChatEventBus;
  onMessagesChange?: (messages: readonly ChatMessage[]) => void;
}

export function StreamingMessageDisplay({
  eventBus,
  onMessagesChange,
}: StreamingMessageDisplayProps) {
  return (
    <ChatEventBusProvider eventBus={eventBus}>
      <ToolOutputProvider>
        <StreamingMessageDisplayInner onMessagesChange={onMessagesChange} />
      </ToolOutputProvider>
    </ChatEventBusProvider>
  );
}

function StreamingMessageDisplayInner({
  onMessagesChange,
}: {
  onMessagesChange?: (messages: readonly ChatMessage[]) => void;
}) {
  const {messages} = useMessages();
  const callbackRef = useRef(onMessagesChange);
  useLayoutEffect(() => {
    callbackRef.current = onMessagesChange;
  });

  useEffect(() => {
    callbackRef.current?.(messages);
  }, [messages]);

  return <StreamingMessageDisplayView messages={messages} />;
}
