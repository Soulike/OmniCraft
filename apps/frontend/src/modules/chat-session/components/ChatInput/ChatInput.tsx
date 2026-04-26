import type {ThinkingLevel} from '@omnicraft/api-schema';
import {useState} from 'react';

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

export function ChatInput(props: ChatInputProps) {
  const {isStreaming, onStop} = props;
  const [input, setInput] = useState('');
  const {thinkingLevel, setThinkingLevel} = useThinkingLevel();

  function handleSend() {
    if (!input.trim()) return;
    if (props.showThinkingLevelSelect) {
      props.onSend(input, thinkingLevel);
    } else {
      props.onSend(input);
    }
    setInput('');
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <ChatInputView
      input={input}
      isStreaming={isStreaming}
      showThinkingLevelSelect={props.showThinkingLevelSelect === true}
      thinkingLevel={thinkingLevel}
      onInputChange={setInput}
      onKeyDown={handleKeyDown}
      onSend={handleSend}
      onStop={onStop}
      onThinkingLevelChange={setThinkingLevel}
    />
  );
}
