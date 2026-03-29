import {Alert, CloseButton} from '@heroui/react';
import type {ComponentProps} from 'react';

import styles from './styles.module.css';

interface ChatAlertProps {
  status: ComponentProps<typeof Alert>['status'];
  title: string;
  message: string;
  onDismiss: ComponentProps<typeof CloseButton>['onPress'];
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
