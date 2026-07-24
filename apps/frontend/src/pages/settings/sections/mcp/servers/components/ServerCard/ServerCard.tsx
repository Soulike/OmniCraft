import {Alert, Button, Card, Switch} from '@heroui/react';
import {AgentType} from '@omnicraft/settings-schema';

import {formatTransportSummary} from '../../helpers/format-transport-summary.js';
import type {McpServerRow} from '../../helpers/merge-servers.js';
import {RemoveServerButton} from '../RemoveServerButton/index.js';
import {ServerToolList} from '../ServerToolList/index.js';
import {StatusChip} from '../StatusChip/index.js';
import styles from './styles.module.css';

interface ServerCardProps {
  row: McpServerRow;
  isSaving: boolean;
  onToggle: (agentType: AgentType, enabled: boolean) => void;
  onEdit: () => void;
  onRemove: () => void;
  onReconnect: () => void;
}

export function ServerCard({
  row,
  isSaving,
  onToggle,
  onEdit,
  onRemove,
  onReconnect,
}: ServerCardProps) {
  return (
    <Card>
      <Card.Content>
        <div className={styles.content}>
          <div className={styles.headerRow}>
            <span className={styles.name}>{row.name}</span>
            <StatusChip status={row.status} />
            <div className={styles.headerActions}>
              <Button
                size='sm'
                variant='ghost'
                isDisabled={isSaving}
                onPress={onEdit}
              >
                Edit
              </Button>
              {row.status !== 'not-enabled' && (
                <Button
                  size='sm'
                  variant='outline'
                  isDisabled={isSaving}
                  onPress={onReconnect}
                >
                  Reconnect
                </Button>
              )}
              <RemoveServerButton
                serverName={row.name}
                isDisabled={isSaving}
                onConfirm={onRemove}
              />
            </div>
          </div>

          <p className={styles.transport}>
            {formatTransportSummary(row.transport)}
          </p>

          {row.status === 'error' && row.error !== undefined && (
            <Alert status='danger'>
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Description>{row.error}</Alert.Description>
              </Alert.Content>
            </Alert>
          )}

          <div className={styles.enableRow}>
            <span className={styles.enableLabel}>Enable for</span>
            <Switch
              isSelected={row.enabledChat}
              isDisabled={isSaving}
              onChange={(selected) => {
                onToggle(AgentType.CHAT, selected);
              }}
            >
              <Switch.Content>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
                Chat
              </Switch.Content>
            </Switch>
            <Switch
              isSelected={row.enabledCoding}
              isDisabled={isSaving}
              onChange={(selected) => {
                onToggle(AgentType.CODING, selected);
              }}
            >
              <Switch.Content>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
                Coding
              </Switch.Content>
            </Switch>
          </div>

          <ServerToolList tools={row.tools} />
        </div>
      </Card.Content>
    </Card>
  );
}
