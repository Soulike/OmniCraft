import {type ReactNode} from 'react';

import styles from './styles.module.css';

interface LayoutViewProps {
  children: ReactNode;
}

/** Root layout view. Renders the application shell. */
export function LayoutView({children}: LayoutViewProps) {
  return <div className={styles.layout}>{children}</div>;
}
