import {Disclosure, ScrollShadow, Spinner} from '@heroui/react';
import type {ThinkingLevel} from '@omnicraft/api-schema';
import clsx from 'clsx';
import {Bot, CircleCheck, CircleX} from 'lucide-react';
import type {RefObject} from 'react';

import {UsageInfo} from '../../../../../UsageInfo/index.js';
import {StreamingMessageDisplay} from '../../../../StreamingMessageDisplay.js';
import type {ChatEventBus, SubagentMode} from '../../../../types.js';
import styles from './styles.module.css';

interface SubagentDisclosureViewProps {
  mode: SubagentMode;
  agentId: string;
  nickname?: string;
  task: string;
  agentType: string;
  thinkingLevel: ThinkingLevel;
  workingDirectory: string;
  status: 'running' | 'complete' | 'error';
  eventBus: ChatEventBus;
  scrollRef: RefObject<HTMLDivElement | null>;
}

const STATUS_ICON_SIZE = 16;

const MODE_LABELS = {
  dispatch: 'Dispatch',
  resume: 'Resume',
} satisfies Record<SubagentMode, string>;

const AGENT_NAME_LABELS = {
  dispatch: 'Subagent',
  resume: 'Resumed subagent',
} satisfies Record<SubagentMode, string>;

export function SubagentDisclosureView({
  mode,
  agentId,
  nickname,
  task,
  agentType,
  thinkingLevel,
  workingDirectory,
  status,
  eventBus,
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
              <span className={styles.modeLabel}>{MODE_LABELS[mode]}</span>
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
                <div className={styles.agentIdRow}>
                  <span className={styles.label}>
                    {AGENT_NAME_LABELS[mode]}
                  </span>
                  <span className={styles.agentId}>
                    {nickname?.trim() ? nickname.trim() : agentId}
                  </span>
                </div>
              </div>
              <ScrollShadow className={styles.content} ref={scrollRef}>
                <StreamingMessageDisplay eventBus={eventBus} />
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
      <UsageInfo eventBus={eventBus} className={styles.usage} />
    </div>
  );
}
