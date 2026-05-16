import {useState} from 'react';

export function useThinkingBlock() {
  const [isExpanded, setIsExpanded] = useState(true);

  return {isExpanded, onExpandedChange: setIsExpanded};
}
