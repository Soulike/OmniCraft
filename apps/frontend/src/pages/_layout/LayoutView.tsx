import {type ReactNode} from 'react';

import {Sidebar} from './components/Sidebar/index.js';
import styles from './styles.module.css';

interface LayoutViewProps {
  children: ReactNode;
}

export function LayoutView({children}: LayoutViewProps) {
  return (
    <div className={styles.layout}>
      <div className={styles.sidebarWrapper}>
        <Sidebar />
      </div>
      <div className={styles.panel}>
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}
