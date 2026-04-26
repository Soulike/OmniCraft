import type {ThinkingLevel} from '@omnicraft/api-schema';
import {useCallback, useState} from 'react';

import {useThinkingLevel} from '../ThinkingLevelSelect/index.js';
import {ChatSessionStarterInputView} from './ChatSessionStarterInputView.js';

interface ChatSessionStarterInputProps {
  isStreaming: boolean;
  onSend: (content: string, thinkingLevel: ThinkingLevel) => void;
  onStop: () => void;
}

export function ChatSessionStarterInput({
  isStreaming,
  onSend,
  onStop,
}: ChatSessionStarterInputProps) {
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
    <ChatSessionStarterInputView
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
