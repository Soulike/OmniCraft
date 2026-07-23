import {Alert, Button, Card, Disclosure, ListBox, Switch} from '@heroui/react';
import {AgentType} from '@omnicraft/settings-schema';

import {formatTransportSummary} from '../../helpers/format-transport-summary.js';
import type {McpServerRow} from '../../helpers/merge-servers.js';
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
  const toolCount = row.tools.length;

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
              <Button
                size='sm'
                variant='danger'
                isDisabled={isSaving}
                onPress={onRemove}
              >
                Remove
              </Button>
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
            {row.status !== 'not-enabled' && (
              <Button
                className={styles.reconnect}
                size='sm'
                variant='ghost'
                isDisabled={isSaving}
                onPress={onReconnect}
              >
                Reconnect
              </Button>
            )}
          </div>

          {toolCount > 0 && (
            <Disclosure>
              <Disclosure.Heading>
                <Disclosure.Trigger className={styles.toolsTrigger}>
                  {toolCount} {toolCount === 1 ? 'tool' : 'tools'}
                  <Disclosure.Indicator />
                </Disclosure.Trigger>
              </Disclosure.Heading>
              <Disclosure.Content>
                <ListBox aria-label={`${row.name} tools`} selectionMode='none'>
                  {row.tools.map((tool) => (
                    <ListBox.Item
                      key={tool.name}
                      id={tool.name}
                      textValue={tool.name}
                    >
                      <span className={styles.toolName}>{tool.name}</span>
                      {tool.description !== '' && (
                        <span className={styles.toolDesc}>
                          {tool.description}
                        </span>
                      )}
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Disclosure.Content>
            </Disclosure>
          )}
        </div>
      </Card.Content>
    </Card>
  );
}
