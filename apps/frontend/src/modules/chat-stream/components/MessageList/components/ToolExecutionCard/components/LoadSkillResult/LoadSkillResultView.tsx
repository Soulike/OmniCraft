import {MarkdownRenderer} from '@/components/MarkdownRenderer/index.js';

import styles from './styles.module.css';

interface LoadSkillResultViewProps {
  name: string;
  content: string;
}

export function LoadSkillResultView({name, content}: LoadSkillResultViewProps) {
  return (
    <div className={styles.container}>
      <span className={styles.name}>{name}</span>
      <div className={styles.content}>
        <MarkdownRenderer content={content} />
      </div>
    </div>
  );
}
