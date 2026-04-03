import {Button, TextArea} from '@heroui/react';
import {SendIcon, SquareIcon} from 'lucide-react';

import styles from './styles.module.css';

interface ChatInputViewProps {
  input: string;
  isStreaming: boolean;
  onInputChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onSend: () => void;
  onStop: () => void;
}

export function ChatInputView({
  input,
  isStreaming,
  onInputChange,
  onKeyDown,
  onSend,
  onStop,
}: ChatInputViewProps) {
  return (
    <div className={styles.container}>
      <TextArea
        aria-label='Chat message'
        className={styles.textarea}
        placeholder='Type a message... (Enter to send, Shift+Enter for newline)'
        rows={1}
        value={input}
        disabled={isStreaming}
        onChange={(e) => {
          onInputChange(e.target.value);
        }}
        onKeyDown={onKeyDown}
      />
      {isStreaming ? (
        <Button
          aria-label='Stop generation'
          variant='danger'
          isIconOnly
          onPress={onStop}
        >
          <SquareIcon size={18} />
        </Button>
      ) : (
        <Button
          aria-label='Send message'
          isDisabled={!input.trim()}
          isIconOnly
          onPress={onSend}
        >
          <SendIcon size={18} />
        </Button>
      )}
    </div>
  );
}
