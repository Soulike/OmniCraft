import {Info} from 'lucide-react';

import styles from './styles.module.css';

const ICON_SIZE = 16;

export function UnsupportedNotice() {
  return (
    <div className={styles.notice}>
      <Info size={ICON_SIZE} className={styles.icon} />
      <span>This session can&apos;t accept answers.</span>
    </div>
  );
}
