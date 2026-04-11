import {useEffect, useState} from 'react';

interface UseThinkingBlockOptions {
  done: boolean;
}

export function useThinkingBlock({done}: UseThinkingBlockOptions) {
  const [isExpanded, setIsExpanded] = useState(!done);

  useEffect(() => {
    if (done) setIsExpanded(false);
  }, [done]);

  return {isExpanded, onExpandedChange: setIsExpanded};
}
