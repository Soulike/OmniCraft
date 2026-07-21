import {formatRelativeTime} from './helpers/format-relative-time.js';
import {useTaskDeletion} from './hooks/useTaskDeletion.js';
import {TaskListItemView} from './TaskListItemView.js';

interface TaskListItemProps {
  title: string;
  updatedAt?: number;
  isSelected: boolean;
  now: number;
  onDelete: () => Promise<void>;
}

export function TaskListItem({
  title,
  updatedAt,
  isSelected,
  now,
  onDelete,
}: TaskListItemProps) {
  const {isDeleteOpen, isDeleting, onDeleteOpenChange, onConfirmDelete} =
    useTaskDeletion(onDelete);
  const timeLabel =
    updatedAt === undefined ? null : formatRelativeTime(updatedAt, now);

  return (
    <TaskListItemView
      title={title}
      timeLabel={timeLabel}
      isSelected={isSelected}
      isDeleteOpen={isDeleteOpen}
      onDeleteOpenChange={onDeleteOpenChange}
      onConfirmDelete={onConfirmDelete}
      isDeleting={isDeleting}
    />
  );
}
