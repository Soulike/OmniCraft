import {useCallback, useState} from 'react';

import {ChatInputView} from './ChatInputView.js';

interface ChatInputProps {
  onSend: (content: string) => void;
  isDisabled: boolean;
}

export function ChatInput({onSend, isDisabled}: ChatInputProps) {
  const [input, setInput] = useState('');

  const handleSend = useCallback(() => {
    if (!input.trim()) return;
    onSend(input);
    setInput('');
  }, [input, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <ChatInputView
      input={input}
      isDisabled={isDisabled}
      onInputChange={setInput}
      onKeyDown={handleKeyDown}
      onSend={handleSend}
    />
  );
}
