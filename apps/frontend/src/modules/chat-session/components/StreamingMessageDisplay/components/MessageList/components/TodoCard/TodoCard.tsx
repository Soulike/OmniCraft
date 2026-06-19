import type {SseTodoItem} from '@omnicraft/sse-events';

import {TodoCardView} from './TodoCardView.js';

interface TodoCardProps {
  items: readonly SseTodoItem[];
}

export function TodoCard({items}: TodoCardProps) {
  return <TodoCardView items={items} />;
}
