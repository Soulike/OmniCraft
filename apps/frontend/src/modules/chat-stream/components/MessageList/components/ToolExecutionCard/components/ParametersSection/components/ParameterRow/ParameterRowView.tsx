import type {ReactNode} from 'react';

import styles from './styles.module.css';

interface ParameterRowViewProps {
  label: string;
  children: ReactNode;
}

export function ParameterRowView({label, children}: ParameterRowViewProps) {
  return (
    <div className={styles.row}>
      <span className={styles.label}>{label}</span>
      {children}
    </div>
  );
}
