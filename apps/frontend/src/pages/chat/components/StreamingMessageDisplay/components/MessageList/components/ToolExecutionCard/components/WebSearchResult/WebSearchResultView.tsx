import styles from './styles.module.css';

interface WebSearchResultViewProps {
  results: readonly {
    title: string;
    url: string;
    score: number;
    content: string;
  }[];
}

export function WebSearchResultView({results}: WebSearchResultViewProps) {
  return (
    <div className={styles.container}>
      {results.map((result, i) => (
        <a
          key={i}
          className={styles.card}
          href={result.url}
          rel='noopener noreferrer'
          target='_blank'
        >
          <span className={styles.title}>{result.title}</span>
          <span className={styles.url}>{result.url}</span>
          <span className={styles.snippet}>{result.content}</span>
        </a>
      ))}
    </div>
  );
}
