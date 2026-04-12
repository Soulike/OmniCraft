import {CircleAlert} from 'lucide-react';

import styles from './styles.module.css';

interface CancelledCardProps {
  message: string | null;
}

export function CancelledCard({message}: CancelledCardProps) {
  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <CircleAlert size={16} className={styles.statusIcon} />
        <span className={styles.headerTitle}>
          {message ?? 'User declined to answer.'}
        </span>
      </div>
    </div>
  );
}
