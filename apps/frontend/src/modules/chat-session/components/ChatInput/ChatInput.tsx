import type {ThinkingLevel} from '@omnicraft/api-schema';
import {useCallback, useState} from 'react';

import {useThinkingLevel} from '../ThinkingLevelSelect/index.js';
import {ChatInputView} from './ChatInputView.js';

type ChatInputProps = {
  isStreaming: boolean;
  onStop: () => void;
} & (
  | {
      showThinkingLevelSelect?: false;
      onSend: (content: string) => void;
    }
  | {
      showThinkingLevelSelect: true;
      onSend: (content: string, thinkingLevel: ThinkingLevel) => void;
    }
);

export function ChatInput({
  isStreaming,
  onSend,
  onStop,
  showThinkingLevelSelect,
}: ChatInputProps) {
  const [input, setInput] = useState('');
  const {thinkingLevel, setThinkingLevel} = useThinkingLevel();
  const shouldShowThinkingLevelSelect = showThinkingLevelSelect === true;

  const handleSend = useCallback(() => {
    if (!input.trim()) return;
    if (showThinkingLevelSelect) {
      onSend(input, thinkingLevel);
    } else {
      onSend(input);
    }
    setInput('');
  }, [input, onSend, showThinkingLevelSelect, thinkingLevel]);

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
      showThinkingLevelSelect={shouldShowThinkingLevelSelect}
      thinkingLevel={thinkingLevel}
      onInputChange={setInput}
      onKeyDown={handleKeyDown}
      onSend={handleSend}
      onStop={onStop}
      onThinkingLevelChange={setThinkingLevel}
    />
  );
}
