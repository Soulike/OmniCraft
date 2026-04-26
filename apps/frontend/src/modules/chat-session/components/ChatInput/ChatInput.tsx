import {useCallback, useState} from 'react';

import {useSessionConfig} from '../../hooks/useSessionConfig.js';
import {ChatInputView} from './ChatInputView.js';

interface ChatInputProps {
  isStreaming: boolean;
  onSend: (content: string) => void;
  onStop: () => void;
  showThinkingLevelSelect?: boolean;
}

export function ChatInput({
  isStreaming,
  onSend,
  onStop,
  showThinkingLevelSelect,
}: ChatInputProps) {
  const [input, setInput] = useState('');
  const {thinkingLevel, setThinkingLevel} = useSessionConfig();

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
      isStreaming={isStreaming}
      showThinkingLevelSelect={showThinkingLevelSelect ?? false}
      thinkingLevel={thinkingLevel}
      onInputChange={setInput}
      onKeyDown={handleKeyDown}
      onSend={handleSend}
      onStop={onStop}
      onThinkingLevelChange={setThinkingLevel}
    />
  );
}
