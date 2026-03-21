import {Button, Spinner} from '@heroui/react';
import {type ReactNode} from 'react';

import styles from './styles.module.css';

interface SettingSectionViewProps {
  title: string;
  children: ReactNode;
  isLoading: boolean;
  isSaving: boolean;
  onSave: () => void;
}

export function SettingSectionView({
  title,
  children,
  isLoading,
  isSaving,
  onSave,
}: SettingSectionViewProps) {
  return (
    <div className={styles.section}>
      <h2 className={styles.title}>{title}</h2>
      <div className={styles.fields}>{children}</div>
      <Button isPending={isSaving} isDisabled={isLoading} onPress={onSave}>
        {({isPending}) => (
          <>
            {isPending && <Spinner color='current' size='sm' />}
            Save
          </>
        )}
      </Button>
    </div>
  );
}
