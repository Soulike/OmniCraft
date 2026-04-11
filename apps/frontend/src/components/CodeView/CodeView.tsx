import type {ReactNode} from 'react';

import styles from './styles.module.css';

interface CodeViewProps {
  startLine?: number;
  lineCount: number;
  children: ReactNode;
}

export function CodeView({startLine = 1, lineCount, children}: CodeViewProps) {
  return (
    <div className={styles.body}>
      <div className={styles.lineNumbers} aria-hidden='true'>
        {Array.from({length: lineCount}, (_, i) => (
          <span key={i}>{startLine + i}</span>
        ))}
      </div>
      <pre className={styles.pre}>{children}</pre>
    </div>
  );
}
