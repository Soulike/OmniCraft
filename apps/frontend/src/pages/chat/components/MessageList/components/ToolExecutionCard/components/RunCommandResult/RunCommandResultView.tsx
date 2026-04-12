import styles from './styles.module.css';

interface RunCommandResultViewProps {
  command: string;
  cwd: string;
  exitCode: number;
  timedOut: boolean;
  stdout: string;
  stderr: string;
}

export function RunCommandResultView({
  command,
  cwd,
  exitCode,
  timedOut,
  stdout,
  stderr,
}: RunCommandResultViewProps) {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <code className={styles.command}>$ {command}</code>
        <span className={styles.cwd}>{cwd}</span>
      </div>
      <div className={styles.badges}>
        {timedOut ? (
          <span className={styles.badgeTimeout}>timed out</span>
        ) : exitCode === 0 ? (
          <span className={styles.badgeSuccess}>exit 0</span>
        ) : (
          <span className={styles.badgeError}>exit {exitCode}</span>
        )}
      </div>
      {stdout && (
        <div className={styles.outputSection}>
          <span className={styles.outputLabel}>stdout</span>
          <pre className={styles.output}>{stdout}</pre>
        </div>
      )}
      {stderr && (
        <div className={styles.outputSection}>
          <span className={styles.outputLabel}>stderr</span>
          <pre className={styles.stderr}>{stderr}</pre>
        </div>
      )}
    </div>
  );
}
