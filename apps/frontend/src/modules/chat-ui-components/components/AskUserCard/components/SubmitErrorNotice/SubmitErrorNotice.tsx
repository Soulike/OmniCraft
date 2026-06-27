import {TriangleAlert} from 'lucide-react';

import styles from './styles.module.css';

const ICON_SIZE = 16;

export function SubmitErrorNotice() {
  return (
    <div className={styles.notice} role='alert'>
      <TriangleAlert size={ICON_SIZE} className={styles.icon} />
      <span>Couldn&apos;t reach the server. Try again.</span>
    </div>
  );
}
