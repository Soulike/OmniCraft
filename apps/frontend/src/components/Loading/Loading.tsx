import {Spinner} from '@heroui/react';

import styles from './styles.module.css';

/** A centered loading spinner. */
export function Loading() {
  return (
    <div className={styles.container}>
      <Spinner size='lg' />
    </div>
  );
}
