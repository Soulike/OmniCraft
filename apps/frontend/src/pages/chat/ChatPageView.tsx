import {Alert, CloseButton} from '@heroui/react';
import type {RefObject} from 'react';

import {ChatInput} from './components/ChatInput/index.js';
import {MessageList} from './components/MessageList/index.js';
import styles from './styles.module.css';
import type {ChatMessage} from './types.js';

interface ChatPageViewProps {
  messages: ChatMessage[];
  isInputDisabled: boolean;
  error: string | null;
  scrollRef: RefObject<HTMLDivElement | null>;
  onSend: (content: string) => void;
  onDismissError: () => void;
}

export function ChatPageView({
  messages,
  isInputDisabled,
  error,
  scrollRef,
  onSend,
  onDismissError,
}: ChatPageViewProps) {
  return (
    <div className={styles.page}>
      {error && (
        <Alert status='danger'>
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Error</Alert.Title>
            <Alert.Description>{error}</Alert.Description>
          </Alert.Content>
          <CloseButton onPress={onDismissError} />
        </Alert>
      )}
      <div className={styles.messageListWrapper}>
        <MessageList messages={messages} scrollRef={scrollRef} />
      </div>
      <ChatInput onSend={onSend} isDisabled={isInputDisabled} />
    </div>
  );
}
