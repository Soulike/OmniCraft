import {useEffect, useLayoutEffect, useRef} from 'react';

import {ChatEventBusProvider} from './contexts/ChatEventBusContext/index.js';
import {SessionIdContext} from './contexts/SessionIdContext/index.js';
import {ToolOutputProvider} from './contexts/ToolOutputContext/index.js';
import {useMessages} from './hooks/useMessages.js';
import {StreamingMessageDisplayView} from './StreamingMessageDisplayView.js';
import type {ChatEventBus, ChatMessage} from './types.js';

interface StreamingMessageDisplayProps {
  eventBus: ChatEventBus;
  sessionId: string | null;
  onMessagesChange?: (messages: readonly ChatMessage[]) => void;
}

export function StreamingMessageDisplay({
  eventBus,
  sessionId,
  onMessagesChange,
}: StreamingMessageDisplayProps) {
  return (
    <ChatEventBusProvider eventBus={eventBus}>
      <SessionIdContext value={sessionId}>
        <ToolOutputProvider>
          <StreamingMessageDisplayInner onMessagesChange={onMessagesChange} />
        </ToolOutputProvider>
      </SessionIdContext>
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
