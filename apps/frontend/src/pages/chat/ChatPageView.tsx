import type {RefObject} from 'react';

import {ChatAlert} from './components/ChatAlert/index.js';
import {ChatInput} from './components/ChatInput/index.js';
import {MessageList} from './components/MessageList/index.js';
import styles from './styles.module.css';
import type {ChatMessage} from './types.js';

interface ChatPageViewProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  isInputDisabled: boolean;
  error: string | null;
  maxRoundsReached: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  onSend: (content: string) => void;
  onDismissError: () => void;
  onDismissMaxRoundsReached: () => void;
}

export function ChatPageView({
  messages,
  isStreaming,
  isInputDisabled,
  error,
  maxRoundsReached,
  scrollRef,
  onSend,
  onDismissError,
  onDismissMaxRoundsReached,
}: ChatPageViewProps) {
  return (
    <div className={styles.page}>
      {error && (
        <ChatAlert
          status='danger'
          title='Error'
          message={error}
          onDismiss={onDismissError}
        />
      )}
      {maxRoundsReached && (
        <ChatAlert
          status='warning'
          title='Tool limit reached'
          message='The assistant reached the maximum number of tool execution rounds. You can increase this limit in Settings > Agent.'
          onDismiss={onDismissMaxRoundsReached}
        />
      )}
      <div className={styles.messageListWrapper} ref={scrollRef}>
        <MessageList messages={messages} isStreaming={isStreaming} />
      </div>
      <ChatInput onSend={onSend} isDisabled={isInputDisabled} />
    </div>
  );
}
