import {Alert, CloseButton} from '@heroui/react';

import styles from './styles.module.css';

interface ChatAlertProps {
  status: 'danger' | 'warning';
  title: string;
  message: string;
  onDismiss: () => void;
}

export function ChatAlert({status, title, message, onDismiss}: ChatAlertProps) {
  return (
    <div className={styles.container}>
      <Alert status={status}>
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>{title}</Alert.Title>
          <Alert.Description>{message}</Alert.Description>
        </Alert.Content>
        <CloseButton onPress={onDismiss} />
      </Alert>
    </div>
  );
}
