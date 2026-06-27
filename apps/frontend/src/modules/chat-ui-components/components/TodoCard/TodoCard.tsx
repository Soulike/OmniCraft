import type {SseTodoItem} from '@omnicraft/sse-events';

import {useTodoCard} from './hooks/useTodoCard.js';
import {TodoCardView} from './TodoCardView.js';

interface TodoCardProps {
  items: readonly SseTodoItem[];
}

export function TodoCard({items}: TodoCardProps) {
  const {isExpanded, onExpandedChange} = useTodoCard();

  return (
    <TodoCardView
      items={items}
      isExpanded={isExpanded}
      onExpandedChange={onExpandedChange}
    />
  );
}
