import {Disclosure, ProgressBar, Tooltip} from '@heroui/react';
import type {SseTodoItem} from '@omnicraft/sse-events';

import {
  StatusTimeline,
  type StatusTimelineItem,
  type StatusTimelineStatus,
} from '@/components/StatusTimeline/index.js';

import styles from './styles.module.css';

interface TodoCardViewProps {
  items: readonly SseTodoItem[];
  isExpanded: boolean;
  onExpandedChange: (isExpanded: boolean) => void;
}

const STATUS_MAP = {
  pending: 'pending',
  in_progress: 'in-progress',
  completed: 'done',
} satisfies Record<SseTodoItem['status'], StatusTimelineStatus>;

export function TodoCardView({
  items,
  isExpanded,
  onExpandedChange,
}: TodoCardViewProps) {
  const total = items.length;
  const completed = items.filter((i) => i.status === 'completed').length;
  const current = items.find((i) => i.status === 'in_progress');
  const percent = total === 0 ? 0 : (completed / total) * 100;

  const timelineItems: StatusTimelineItem[] = items.map((item) => ({
    status: STATUS_MAP[item.status],
    content: (
      <Tooltip delay={300}>
        <Tooltip.Trigger>
          <span
            className={
              item.status === 'completed' ? styles.completed : undefined
            }
            data-completed={item.status === 'completed' ? 'true' : undefined}
          >
            {item.subject}
          </span>
        </Tooltip.Trigger>
        <Tooltip.Content>{item.description}</Tooltip.Content>
      </Tooltip>
    ),
  }));

  return (
    <div className={styles.card}>
      <Disclosure isExpanded={isExpanded} onExpandedChange={onExpandedChange}>
        <Disclosure.Heading>
          <Disclosure.Trigger className={styles.trigger}>
            <ProgressBar
              aria-label='Plan progress'
              className={styles.progress}
              color='accent'
              size='sm'
              value={percent}
            >
              <ProgressBar.Track>
                <ProgressBar.Fill />
              </ProgressBar.Track>
            </ProgressBar>
            <span className={styles.headLabel}>Plan</span>
            <span aria-hidden='true' className={styles.currentDivider}>
              ·
            </span>
            <span className={styles.headCount}>
              {completed}/{total}
            </span>
            {current && (
              <span className={styles.current} data-testid='todo-current'>
                <span aria-hidden='true' className={styles.currentDivider}>
                  ·
                </span>
                {current.subject}
              </span>
            )}
            <Disclosure.Indicator className={styles.indicator} />
          </Disclosure.Trigger>
        </Disclosure.Heading>
        <Disclosure.Content>
          <Disclosure.Body className={styles.body}>
            {isExpanded && <StatusTimeline items={timelineItems} />}
          </Disclosure.Body>
        </Disclosure.Content>
      </Disclosure>
    </div>
  );
}
