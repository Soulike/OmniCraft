import {useEffect, useLayoutEffect, useRef} from 'react';

import type {
  AskUserSubmitHandler,
  ChatEventBus,
  ChatMessage,
} from '@/modules/chat-events/index.js';

import {AskUserSubmitContext} from './contexts/AskUserSubmitContext/index.js';
import {ChatEventBusProvider} from './contexts/ChatEventBusContext/index.js';
import {ToolOutputProvider} from './contexts/ToolOutputContext/index.js';
import {useMessages} from './hooks/useMessages.js';
import {StreamingMessageDisplayView} from './StreamingMessageDisplayView.js';

interface StreamingMessageDisplayProps {
  eventBus: ChatEventBus;
  /** The ask_user submit handler, or null when this stream cannot accept
   *  submissions (e.g. a subagent stream, or a page with no active session). */
  onAskUserSubmit: AskUserSubmitHandler | null;
  onMessagesChange?: (messages: readonly ChatMessage[]) => void;
}

export function StreamingMessageDisplay({
  eventBus,
  onAskUserSubmit,
  onMessagesChange,
}: StreamingMessageDisplayProps) {
  return (
    <ChatEventBusProvider eventBus={eventBus}>
      <AskUserSubmitContext value={onAskUserSubmit}>
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
