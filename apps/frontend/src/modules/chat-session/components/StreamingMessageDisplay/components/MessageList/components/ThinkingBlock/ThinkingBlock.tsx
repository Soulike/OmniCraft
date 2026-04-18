import {useDeferredValue} from 'react';

import {useStreamingText} from '@/hooks/useStreamingText.js';

import {useThinkingBlock} from './hooks/useThinkingBlock.js';
import {ThinkingBlockView} from './ThinkingBlockView.js';

interface ThinkingBlockProps {
  content: string;
  done: boolean;
}

export function ThinkingBlock({content, done}: ThinkingBlockProps) {
  const {isExpanded, onExpandedChange} = useThinkingBlock({done});
  const {displayedContent} = useStreamingText(content);
  const deferredContent = useDeferredValue(displayedContent);

  return (
    <ThinkingBlockView
      content={deferredContent}
      done={done}
      isExpanded={isExpanded}
      onExpandedChange={onExpandedChange}
    />
  );
}
