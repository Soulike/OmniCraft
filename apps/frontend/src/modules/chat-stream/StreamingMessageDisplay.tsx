import {useEffect, useLayoutEffect, useRef} from 'react';

import {AskUserSubmitContext} from './contexts/AskUserSubmitContext/index.js';
import {ChatEventBusProvider} from './contexts/ChatEventBusContext/index.js';
import {ToolOutputProvider} from './contexts/ToolOutputContext/index.js';
import {useMessages} from './hooks/useMessages.js';
import {StreamingMessageDisplayView} from './StreamingMessageDisplayView.js';
import type {AskUserSubmitHandler, ChatEventBus, ChatMessage} from './types.js';

interface StreamingMessageDisplayProps {
  eventBus: ChatEventBus;
  onAskUserSubmit?: AskUserSubmitHandler | null;
  onMessagesChange?: (messages: readonly ChatMessage[]) => void;
}

export function StreamingMessageDisplay({
  eventBus,
  onAskUserSubmit,
  onMessagesChange,
}: StreamingMessageDisplayProps) {
  return (
    <ChatEventBusProvider eventBus={eventBus}>
      <AskUserSubmitContext value={onAskUserSubmit ?? null}>
        <ToolOutputProvider>
          <StreamingMessageDisplayInner onMessagesChange={onMessagesChange} />
        </ToolOutputProvider>
      </AskUserSubmitContext>
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
