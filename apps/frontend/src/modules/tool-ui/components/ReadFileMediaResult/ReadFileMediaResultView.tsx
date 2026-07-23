import styles from './styles.module.css';

interface ReadFileMediaResultViewProps {
  filePath: string;
  mediaType: string;
  byteSize: number;
  kind: 'image' | 'document';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function ReadFileMediaResultView({
  filePath,
  mediaType,
  byteSize,
  kind,
}: ReadFileMediaResultViewProps) {
  return (
    <div className={styles.chip}>
      <span aria-hidden='true'>{kind === 'image' ? '🖼' : '📄'}</span>
      <code className={styles.filePath}>{filePath}</code>
      <span className={styles.meta}>
        {mediaType} · {formatBytes(byteSize)}
      </span>
    </div>
  );
}
