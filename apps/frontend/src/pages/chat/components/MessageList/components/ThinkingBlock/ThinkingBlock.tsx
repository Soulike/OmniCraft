import {useThinkingBlock} from './hooks/useThinkingBlock.js';
import {ThinkingBlockView} from './ThinkingBlockView.js';

interface ThinkingBlockProps {
  content: string;
  done: boolean;
}

export function ThinkingBlock({content, done}: ThinkingBlockProps) {
  const {isExpanded, onExpandedChange} = useThinkingBlock({done});

  return (
    <ThinkingBlockView
      content={content}
      done={done}
      isExpanded={isExpanded}
      onExpandedChange={onExpandedChange}
    />
  );
}
