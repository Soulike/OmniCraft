import type {ReactNode} from 'react';

import styles from './styles.module.css';

interface ShowcaseSectionProps {
  id: string;
  title: string;
  children: ReactNode;
}

export function ShowcaseSection({id, title, children}: ShowcaseSectionProps) {
  return (
    <section id={id} className={styles.section}>
      <h2 className={styles.heading}>{title}</h2>
      <div className={styles.specimens}>{children}</div>
    </section>
  );
}
