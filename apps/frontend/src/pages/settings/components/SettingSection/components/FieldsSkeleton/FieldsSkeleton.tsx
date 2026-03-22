import {Skeleton} from '@heroui/react';

import styles from './styles.module.css';

export function FieldsSkeleton() {
  return (
    <div className={styles.fields}>
      {Array.from({length: 3}).map((_, i) => (
        <div key={i} className={styles.fieldSkeleton}>
          <Skeleton className={styles.skeletonLabel} />
          <Skeleton className={styles.skeletonInput} />
        </div>
      ))}
    </div>
  );
}
