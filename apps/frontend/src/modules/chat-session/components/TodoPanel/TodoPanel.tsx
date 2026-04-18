import {useTodoItems} from '../../hooks/useTodoItems.js';
import {TodoPanelView} from './TodoPanelView.js';

export function TodoPanel() {
  const {items} = useTodoItems();
  return <TodoPanelView items={items} />;
}
