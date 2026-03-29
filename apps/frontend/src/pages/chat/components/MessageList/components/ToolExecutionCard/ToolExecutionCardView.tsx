import {Disclosure, Spinner} from '@heroui/react';
import clsx from 'clsx';
import {useMemo} from 'react';

import styles from './styles.module.css';

interface ToolExecutionCardViewProps {
  toolName: string;
  arguments: string;
  status: 'running' | 'done' | 'error';
  result?: string;
}

export function ToolExecutionCardView({
  toolName,
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
            <span className={styles.toolName}>{toolName}</span>
            <span
              className={clsx(styles.status, {
                [styles.statusRunning]: status === 'running',
                [styles.statusDone]: status === 'done',
                [styles.statusError]: status === 'error',
              })}
            >
              {status === 'running' && (
                <>
                  <Spinner size='sm' />
                  <span>Running...</span>
                </>
              )}
              {status === 'done' && <span>Done</span>}
              {status === 'error' && <span>Error</span>}
            </span>
            <Disclosure.Indicator />
          </Disclosure.Trigger>
        </Disclosure.Heading>
        <Disclosure.Content>
          <Disclosure.Body className={styles.body}>
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
