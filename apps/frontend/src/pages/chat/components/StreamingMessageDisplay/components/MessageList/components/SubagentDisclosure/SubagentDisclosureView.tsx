import {Disclosure, ScrollShadow, Spinner} from '@heroui/react';
import type {SseUsage} from '@omnicraft/sse-events';
import clsx from 'clsx';
import {Bot, CircleCheck, CircleX} from 'lucide-react';
import {lazy, type RefObject, Suspense} from 'react';

import {UsageInfo} from '../../../../../UsageInfo/index.js';
import type {ChatEventBus} from '../../../../types.js';
import styles from './styles.module.css';

const StreamingMessageDisplay = lazy(async () => {
  const {StreamingMessageDisplay} = await import('../../../../index.js');
  return {default: StreamingMessageDisplay};
});

interface SubagentDisclosureViewProps {
  task: string;
  agentType: string;
  thinkingLevel: string;
  workingDirectory: string;
  status: 'running' | 'complete' | 'error';
  eventBus: ChatEventBus;
  usage: SseUsage | null;
  scrollRef: RefObject<HTMLDivElement | null>;
}

const STATUS_ICON_SIZE = 16;

export function SubagentDisclosureView({
  task,
  agentType,
  thinkingLevel,
  workingDirectory,
  status,
  eventBus,
  usage,
  scrollRef,
}: SubagentDisclosureViewProps) {
  return (
    <div className={styles.wrapper}>
      <div
        className={clsx(styles.card, status === 'running' && styles.running)}
      >
        <Disclosure>
          <Disclosure.Heading>
            <Disclosure.Trigger className={styles.trigger}>
              {status === 'running' && (
                <Spinner size='sm' className={styles.spinner} />
              )}
              {status === 'complete' && (
                <CircleCheck
                  className={styles.statusComplete}
                  size={STATUS_ICON_SIZE}
                />
              )}
              {status === 'error' && (
                <CircleX
                  className={styles.statusError}
                  size={STATUS_ICON_SIZE}
                />
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
                <ScrollShadow className={styles.taskText}>{task}</ScrollShadow>
                <span className={styles.workingDir}>{workingDirectory}</span>
              </div>
              <ScrollShadow className={styles.content} ref={scrollRef}>
                <Suspense>
                  <StreamingMessageDisplay
                    eventBus={eventBus}
                    sessionId={null}
                  />
                </Suspense>
              </ScrollShadow>
            </Disclosure.Body>
            <div className={styles.footer}>
              <span className={styles.paramTag}>
                Type: <span className={styles.paramValue}>{agentType}</span>
              </span>
              <span className={styles.paramTag}>
                Thinking:{' '}
                <span className={styles.paramValue}>{thinkingLevel}</span>
              </span>
            </div>
          </Disclosure.Content>
        </Disclosure>
      </div>
      {usage && <UsageInfo usage={usage} />}
    </div>
  );
}
