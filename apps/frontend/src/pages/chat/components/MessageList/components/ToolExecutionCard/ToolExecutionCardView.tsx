import {Disclosure, Spinner} from '@heroui/react';
import clsx from 'clsx';
import {CircleCheck, CircleX} from 'lucide-react';
import {useMemo} from 'react';

import styles from './styles.module.css';

interface ToolExecutionCardViewProps {
  toolName: string;
  displayName: string;
  arguments: string;
  status: 'running' | 'done' | 'error';
  result?: string;
}

const STATUS_ICON_SIZE = 16;

export function ToolExecutionCardView({
  toolName,
  displayName,
  arguments: toolArguments,
  status,
  result,
}: ToolExecutionCardViewProps) {
  const formattedArguments = useMemo(
    () => formatJson(toolArguments),
    [toolArguments],
  );
  const formattedResult = useMemo(
    () => (result !== undefined ? formatJson(result) : undefined),
    [result],
  );

  return (
    <div className={styles.card}>
      <Disclosure>
        <Disclosure.Heading>
          <Disclosure.Trigger className={styles.trigger}>
            {status === 'running' && <Spinner size='sm' />}
            {status === 'done' && (
              <CircleCheck
                className={styles.statusDone}
                size={STATUS_ICON_SIZE}
              />
            )}
            {status === 'error' && (
              <CircleX className={styles.statusError} size={STATUS_ICON_SIZE} />
            )}
            <span className={styles.toolName}>{displayName}</span>
            <Disclosure.Indicator />
          </Disclosure.Trigger>
        </Disclosure.Heading>
        <Disclosure.Content>
          <Disclosure.Body className={styles.body}>
            <div className={styles.section}>
              <span className={styles.label}>Tool</span>
              <code className={styles.code}>{toolName}</code>
            </div>
            <div className={styles.section}>
              <span className={styles.label}>Arguments</span>
              <pre className={styles.pre}>{formattedArguments}</pre>
            </div>
            {formattedResult !== undefined && (
              <div className={styles.section}>
                <span className={styles.label}>Result</span>
                <pre
                  className={clsx(styles.pre, {
                    [styles.preError]: status === 'error',
                  })}
                >
                  {formattedResult}
                </pre>
              </div>
            )}
          </Disclosure.Body>
        </Disclosure.Content>
      </Disclosure>
    </div>
  );
}

/** Attempts to pretty-print a JSON string. Falls back to the raw string. */
function formatJson(jsonString: string): string {
  try {
    return JSON.stringify(JSON.parse(jsonString) as unknown, null, 2);
  } catch {
    return jsonString;
  }
}
