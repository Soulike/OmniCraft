import {Button} from '@heroui/react';

import styles from './styles.module.css';

interface LoadErrorProps {
  message: string;
  onRetry: () => void;
}

export function LoadError({message, onRetry}: LoadErrorProps) {
  return (
    <div className={styles.container}>
      <p>{message}</p>
      <Button variant='secondary' size='sm' onPress={onRetry}>
        Retry
      </Button>
    </div>
  );
}
