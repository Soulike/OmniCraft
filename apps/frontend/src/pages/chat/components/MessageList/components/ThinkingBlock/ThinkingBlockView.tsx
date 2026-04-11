import {Disclosure, Spinner} from '@heroui/react';
import clsx from 'clsx';
import {CircleCheck} from 'lucide-react';

import {MarkdownRenderer} from '@/components/MarkdownRenderer/index.js';

import styles from './styles.module.css';

interface ThinkingBlockViewProps {
  content: string;
  done: boolean;
  isExpanded: boolean;
  onExpandedChange: (isExpanded: boolean) => void;
}

const STATUS_ICON_SIZE = 16;

export function ThinkingBlockView({
  content,
  done,
  isExpanded,
  onExpandedChange,
}: ThinkingBlockViewProps) {
  return (
    <div className={clsx(styles.card, done ? styles.done : styles.streaming)}>
      <Disclosure isExpanded={isExpanded} onExpandedChange={onExpandedChange}>
        <Disclosure.Heading>
          <Disclosure.Trigger className={styles.trigger}>
            {done ? (
              <CircleCheck size={STATUS_ICON_SIZE} className={styles.label} />
            ) : (
              <Spinner size='sm' />
            )}
            <span className={styles.label}>
              {done ? 'Thought' : 'Thinking...'}
            </span>
            <Disclosure.Indicator />
          </Disclosure.Trigger>
        </Disclosure.Heading>
        <Disclosure.Content>
          <Disclosure.Body className={styles.body}>
            <div className={styles.content}>
              <MarkdownRenderer content={content} />
            </div>
          </Disclosure.Body>
        </Disclosure.Content>
      </Disclosure>
    </div>
  );
}
