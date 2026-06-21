import {Disclosure, Spinner} from '@heroui/react';
import clsx from 'clsx';
import {Archive, TriangleAlert} from 'lucide-react';

import {MarkdownRenderer} from '@/components/MarkdownRenderer/index.js';
import {formatTokenCount} from '@/modules/usage-info/index.js';

import styles from './styles.module.css';

interface InProgressProps {
  status: 'in-progress';
}
interface DoneProps {
  status: 'done';
  beforeTokens: number;
  afterTokens: number;
  summary: string;
}
interface FailedProps {
  status: 'failed';
  errorMessage: string;
}

type ContextCompactionBlockViewProps = (
  | InProgressProps
  | DoneProps
  | FailedProps
) & {
  isExpanded: boolean;
  onExpandedChange: (isExpanded: boolean) => void;
};

const ICON_SIZE = 16;

export function ContextCompactionBlockView(
  props: ContextCompactionBlockViewProps,
) {
  const {isExpanded, onExpandedChange} = props;
  const isInProgress = props.status === 'in-progress';

  return (
    <div
      className={clsx(
        styles.card,
        isInProgress && styles.inProgress,
        props.status === 'done' && styles.done,
        props.status === 'failed' && styles.failed,
      )}
    >
      <Disclosure
        isExpanded={isExpanded}
        onExpandedChange={onExpandedChange}
        isDisabled={isInProgress}
      >
        <Disclosure.Heading>
          <Disclosure.Trigger className={styles.trigger}>
            {isInProgress && <Spinner size='sm' />}
            {props.status === 'done' && (
              <Archive size={ICON_SIZE} className={styles.iconDone} />
            )}
            {props.status === 'failed' && (
              <TriangleAlert size={ICON_SIZE} className={styles.iconFailed} />
            )}
            <span className={styles.label}>
              {isInProgress && 'Compacting context…'}
              {props.status === 'done' &&
                `Context compacted (${formatTokenCount(
                  props.beforeTokens,
                )} → ${formatTokenCount(props.afterTokens)} tokens)`}
              {props.status === 'failed' && 'Compaction failed'}
            </span>
            {!isInProgress && <Disclosure.Indicator />}
          </Disclosure.Trigger>
        </Disclosure.Heading>
        {!isInProgress && (
          <Disclosure.Content>
            <Disclosure.Body className={styles.body}>
              <div className={styles.content}>
                {props.status === 'done' && (
                  <MarkdownRenderer content={props.summary} />
                )}
                {props.status === 'failed' && (
                  <MarkdownRenderer content={props.errorMessage} />
                )}
              </div>
            </Disclosure.Body>
          </Disclosure.Content>
        )}
      </Disclosure>
    </div>
  );
}
