import styles from './styles.module.css';

interface WorkingIndicatorViewProps {
  word: string;
}

export function WorkingIndicatorView({word}: WorkingIndicatorViewProps) {
  return (
    <span className={styles.indicator}>
      <span className={styles.dot} aria-hidden='true' />
      <span className={styles.word}>{word}</span>
    </span>
  );
}
