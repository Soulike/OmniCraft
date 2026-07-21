import styles from './styles.module.css';

export type TaskStatus = 'idle' | 'running' | 'done' | 'waiting';

/** Accessible labels for the states that need user attention. */
const STATUS_LABEL: Record<TaskStatus, string | undefined> = {
  idle: undefined,
  running: 'Running',
  done: 'Finished — review',
  waiting: 'Needs your input',
};

interface TaskStatusIndicatorProps {
  readonly status: TaskStatus;
}

export function TaskStatusIndicator({status}: TaskStatusIndicatorProps) {
  const label = STATUS_LABEL[status];
  return (
    <span
      data-testid='task-status-indicator'
      data-status={status}
      className={styles.indicator}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {status === 'running' && (
        <span data-part='spinner' className={styles.spinner} />
      )}
      {(status === 'done' || status === 'waiting') && (
        <>
          <span data-part='ripple' className={styles.ripple} />
          <span
            data-part='ripple'
            className={`${styles.ripple} ${styles.rippleDelayed}`}
          />
        </>
      )}
    </span>
  );
}
