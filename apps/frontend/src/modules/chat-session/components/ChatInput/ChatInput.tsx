import type {ThinkingLevel} from '@omnicraft/api-schema';
import {useCallback, useState} from 'react';

import {useThinkingLevel} from '../ThinkingLevelSelect/index.js';
import {ChatInputView} from './ChatInputView.js';

interface ChatInputProps {
  isStreaming: boolean;
  onSend: (content: string, thinkingLevel: ThinkingLevel) => void;
  onStop: () => void;
}

export function ChatInput({isStreaming, onSend, onStop}: ChatInputProps) {
  const [input, setInput] = useState('');
  const {thinkingLevel, setThinkingLevel} = useThinkingLevel();

  const handleSend = useCallback(() => {
    if (!input.trim()) return;
    onSend(input, thinkingLevel);
    setInput('');
  }, [input, thinkingLevel, onSend]);

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
      isStreaming={isStreaming}
      thinkingLevel={thinkingLevel}
      onInputChange={setInput}
      onKeyDown={handleKeyDown}
      onSend={handleSend}
      onStop={onStop}
      onThinkingLevelChange={setThinkingLevel}
    />
  );
}
