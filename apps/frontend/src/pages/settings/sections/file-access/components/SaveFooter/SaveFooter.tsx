import {Button, Spinner} from '@heroui/react';

import styles from './styles.module.css';

interface SaveFooterProps {
  isSaving: boolean;
  saveError: string | null;
  isDirty: boolean;
  onSave: () => void;
}

export function SaveFooter({
  isSaving,
  saveError,
  isDirty,
  onSave,
}: SaveFooterProps) {
  return (
    <div className={styles.container}>
      {saveError !== null && <p className={styles.saveError}>{saveError}</p>}
      <Button
        isPending={isSaving}
        isDisabled={!isDirty || isSaving}
        onPress={onSave}
      >
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
