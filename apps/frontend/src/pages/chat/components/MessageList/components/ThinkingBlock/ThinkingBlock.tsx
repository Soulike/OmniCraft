import {useEffect, useState} from 'react';

import {ThinkingBlockView} from './ThinkingBlockView.js';

interface ThinkingBlockProps {
  content: string;
  done: boolean;
}

export function ThinkingBlock({content, done}: ThinkingBlockProps) {
  const [isExpanded, setIsExpanded] = useState(!done);

  useEffect(() => {
    if (done) setIsExpanded(false);
  }, [done]);

  return (
    <ThinkingBlockView
      content={content}
      done={done}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
    />
  );
}
