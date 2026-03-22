import {Loading} from '@/components/Loading/index.js';

import styles from './styles.module.css';

/** Full-page loading state shown while lazy routes are loading. */
export function LoadingPage() {
  return (
    <div className={styles.page}>
      <Loading />
    </div>
  );
}
