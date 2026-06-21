import styles from './styles.module.css';

interface FindFilesResultViewProps {
  pattern: string;
  basePath: string;
  files: readonly string[];
  truncated: boolean;
}

export function FindFilesResultView({
  pattern,
  basePath,
  files,
  truncated,
}: FindFilesResultViewProps) {
  return (
    <div className={styles.container}>
      <div className={styles.meta}>
        <span className={styles.summary}>
          {files.length} {files.length === 1 ? 'file' : 'files'} matching{' '}
          <code className={styles.pattern}>{pattern}</code>
        </span>
        <span className={styles.basePath}>in {basePath}</span>
        {truncated && <span className={styles.truncated}>(truncated)</span>}
      </div>
      <div className={styles.fileList}>
        {files.map((file) => (
          <code key={file} className={styles.filePath}>
            {file}
          </code>
        ))}
      </div>
    </div>
  );
}
