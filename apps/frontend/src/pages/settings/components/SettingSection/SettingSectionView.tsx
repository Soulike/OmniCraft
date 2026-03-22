import {Button, Spinner} from '@heroui/react';
import {type ReactNode} from 'react';

import {LoadError} from '@/components/LoadError/index.js';

import {FieldsSkeleton} from './components/FieldsSkeleton/index.js';
import styles from './styles.module.css';

interface SettingSectionViewProps {
  title: string;
  children: ReactNode;
  isLoading: boolean;
  loadError: boolean;
  isSaving: boolean;
  onSave: () => void;
  onRetry: () => void;
}

export function SettingSectionView({
  title,
  children,
  isLoading,
  loadError,
  isSaving,
  onSave,
  onRetry,
}: SettingSectionViewProps) {
  return (
    <div className={styles.section}>
      <h2 className={styles.title}>{title}</h2>
      {loadError ? (
        <LoadError message='Failed to load settings.' onRetry={onRetry} />
      ) : isLoading ? (
        <FieldsSkeleton />
      ) : (
        <>
          <div className={styles.fields}>{children}</div>
          <Button isPending={isSaving} isDisabled={isSaving} onPress={onSave}>
            {({isPending}) => (
              <>
                {isPending && <Spinner color='current' size='sm' />}
                Save
              </>
            )}
          </Button>
        </>
      )}
    </div>
  );
}
