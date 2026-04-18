import {MarkdownRenderer} from '@/components/MarkdownRenderer/index.js';

import styles from './styles.module.css';

interface WebFetchResultViewProps {
  url: string;
  title?: string;
  content: string;
}

export function WebFetchResultView({
  url,
  title,
  content,
}: WebFetchResultViewProps) {
  return (
    <div className={styles.container}>
      <div className={styles.meta}>
        {title && <span className={styles.title}>{title}</span>}
        <a
          className={styles.url}
          href={url}
          rel='noopener noreferrer'
          target='_blank'
        >
          {url}
        </a>
      </div>
      <div className={styles.content}>
        <MarkdownRenderer content={content} />
      </div>
    </div>
  );
}
