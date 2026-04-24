import styles from './styles.module.css';

interface AccessInfoProps {
  workspace?: string;
}

export function AccessInfo({workspace}: AccessInfoProps) {
  if (workspace === undefined) return null;

  return (
    <div className={styles.container}>
      <span className={styles.item}>Workspace: {workspace}</span>
    </div>
  );
}
