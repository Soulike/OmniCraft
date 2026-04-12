import styles from './styles.module.css';

interface GetCurrentTimeResultViewProps {
  date: string;
  time: string;
  iso: string;
}

export function GetCurrentTimeResultView({
  date,
  time,
  iso,
}: GetCurrentTimeResultViewProps) {
  return (
    <div className={styles.container}>
      <span className={styles.time}>{time}</span>
      <span className={styles.date}>{date}</span>
      <code className={styles.iso}>{iso}</code>
    </div>
  );
}
