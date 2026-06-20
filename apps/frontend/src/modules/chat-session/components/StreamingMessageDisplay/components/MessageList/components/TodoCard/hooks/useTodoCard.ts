import {useState} from 'react';

export function useTodoCard() {
  const [isExpanded, setIsExpanded] = useState(false);

  return {isExpanded, onExpandedChange: setIsExpanded};
}
