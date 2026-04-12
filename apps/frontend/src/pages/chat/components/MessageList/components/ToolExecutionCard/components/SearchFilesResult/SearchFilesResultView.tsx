import type {FileGroup} from './SearchFilesResult.js';
import styles from './styles.module.css';

interface SearchFilesResultViewProps {
  pattern: string;
  basePath: string;
  groups: readonly FileGroup[];
  totalMatches: number;
  truncated: boolean;
}

export function SearchFilesResultView({
  pattern,
  basePath,
  groups,
  totalMatches,
  truncated,
}: SearchFilesResultViewProps) {
  return (
    <div className={styles.container}>
      <div className={styles.meta}>
        <span className={styles.summary}>
          {totalMatches} {totalMatches === 1 ? 'match' : 'matches'} for{' '}
          <code className={styles.pattern}>{pattern}</code>
        </span>
        <span className={styles.basePath}>in {basePath}</span>
        {truncated && <span className={styles.truncated}>(truncated)</span>}
      </div>
      <div className={styles.groups}>
        {groups.map((group) => (
          <div key={group.file} className={styles.group}>
            <div className={styles.fileHeader}>
              <code className={styles.fileName}>{group.file}</code>
            </div>
            {group.matches.map((match, i) => (
              <div key={i} className={styles.matchRow}>
                <span className={styles.lineNumber}>{match.line}</span>
                <code className={styles.matchContent}>{match.content}</code>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
