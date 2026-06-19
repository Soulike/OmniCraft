import {Disclosure, Tooltip} from '@heroui/react';
import type {SseTodoItem} from '@omnicraft/sse-events';
import {ListChecks} from 'lucide-react';
import {useMemo} from 'react';

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

const ICON_SIZE = 14;

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

  const timelineItems = useMemo<StatusTimelineItem[]>(
    () =>
      items.map((item) => {
        const subject = (
          <span
            className={
              item.status === 'completed' ? styles.completed : undefined
            }
            data-completed={item.status === 'completed' ? 'true' : undefined}
          >
            {item.subject}
          </span>
        );
        return {
          id: item.index,
          status: STATUS_MAP[item.status],
          content: item.description.trim() ? (
            <Tooltip delay={300}>
              <Tooltip.Trigger>{subject}</Tooltip.Trigger>
              <Tooltip.Content>{item.description}</Tooltip.Content>
            </Tooltip>
          ) : (
            subject
          ),
        };
      }),
    [items],
  );

  return (
    <div className={styles.card}>
      <Disclosure isExpanded={isExpanded} onExpandedChange={onExpandedChange}>
        <Disclosure.Heading>
          <Disclosure.Trigger className={styles.trigger}>
            <ListChecks className={styles.icon} size={ICON_SIZE} />
            <span className={styles.headLabel}>Plan</span>
            <span aria-hidden='true' className={styles.divider}>
              ·
            </span>
            <span className={styles.headCount}>
              {completed}/{total}
            </span>
            {current && (
              <span className={styles.current} data-testid='todo-current'>
                <span aria-hidden='true' className={styles.divider}>
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
            <StatusTimeline items={timelineItems} />
          </Disclosure.Body>
        </Disclosure.Content>
      </Disclosure>
    </div>
  );
}
