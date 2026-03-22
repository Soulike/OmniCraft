import {Button, TextArea} from '@heroui/react';
import {SendIcon} from 'lucide-react';

import styles from './styles.module.css';

interface ChatInputViewProps {
  input: string;
  isDisabled: boolean;
  onInputChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onSend: () => void;
}

export function ChatInputView({
  input,
  isDisabled,
  onInputChange,
  onKeyDown,
  onSend,
}: ChatInputViewProps) {
  return (
    <div className={styles.container}>
      <TextArea
        aria-label='Chat message'
        className={styles.textarea}
        placeholder='Type a message... (Enter to send, Shift+Enter for newline)'
        rows={1}
        value={input}
        disabled={isDisabled}
        onChange={(e) => {
          onInputChange(e.target.value);
        }}
        onKeyDown={onKeyDown}
      />
      <Button
        aria-label='Send message'
        isDisabled={!input.trim() || isDisabled}
        isIconOnly
        onPress={onSend}
      >
        <SendIcon size={18} />
      </Button>
    </div>
  );
}
