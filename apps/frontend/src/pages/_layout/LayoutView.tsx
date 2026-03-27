import {type ReactNode} from 'react';

import {Navbar} from './components/Navbar/index.js';
import styles from './styles.module.css';

interface LayoutViewProps {
  children: ReactNode;
}

export function LayoutView({children}: LayoutViewProps) {
  return (
    <div className={styles.layout}>
      <div className={styles.navbarWrapper}>
        <Navbar />
      </div>
      <main className={styles.content}>{children}</main>
    </div>
  );
}
