import {Disclosure, ScrollShadow, Spinner} from '@heroui/react';
import clsx from 'clsx';
import {Bot, CircleCheck, CircleX} from 'lucide-react';
import {lazy, type RefObject, Suspense} from 'react';

import type {ChatEventBus} from '../../../../types.js';
import styles from './styles.module.css';

const StreamingMessageDisplay = lazy(async () => {
  const {StreamingMessageDisplay} = await import('../../../../index.js');
  return {default: StreamingMessageDisplay};
});

interface SubagentDisclosureViewProps {
  task: string;
  status: 'running' | 'complete' | 'error';
  eventBus: ChatEventBus;
  scrollRef: RefObject<HTMLDivElement | null>;
}

const STATUS_ICON_SIZE = 16;

export function SubagentDisclosureView({
  task,
  status,
  eventBus,
  scrollRef,
}: SubagentDisclosureViewProps) {
  return (
    <div className={clsx(styles.card, status === 'running' && styles.running)}>
      <Disclosure>
        <Disclosure.Heading>
          <Disclosure.Trigger className={styles.trigger}>
            {status === 'running' && <Spinner size='sm' />}
            {status === 'complete' && (
              <CircleCheck
                className={styles.statusComplete}
                size={STATUS_ICON_SIZE}
              />
            )}
            {status === 'error' && (
              <CircleX className={styles.statusError} size={STATUS_ICON_SIZE} />
            )}
            <Bot className={styles.botIcon} size={STATUS_ICON_SIZE} />
            <span className={styles.task}>{task}</span>
            <Disclosure.Indicator />
          </Disclosure.Trigger>
        </Disclosure.Heading>
        <Disclosure.Content>
          <Disclosure.Body className={styles.body}>
            <div className={styles.taskDetail}>
              <span className={styles.label}>Task</span>
              <p className={styles.taskText}>{task}</p>
            </div>
            <ScrollShadow className={styles.content} ref={scrollRef}>
              <Suspense>
                <StreamingMessageDisplay eventBus={eventBus} sessionId={null} />
              </Suspense>
            </ScrollShadow>
          </Disclosure.Body>
        </Disclosure.Content>
      </Disclosure>
    </div>
  );
}
