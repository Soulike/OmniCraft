import type {ReactNode} from 'react';

import styles from './styles.module.css';

interface SpecimenProps {
  label: string;
  children: ReactNode;
}

export function Specimen({label, children}: SpecimenProps) {
  return (
    <div className={styles.specimen}>
      <span className={styles.label}>{label}</span>
      <div className={styles.body}>{children}</div>
    </div>
  );
}
