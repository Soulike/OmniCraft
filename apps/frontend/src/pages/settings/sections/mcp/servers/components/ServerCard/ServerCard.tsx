import {
  Alert,
  Button,
  Card,
  Disclosure,
  DisclosureGroup,
  Switch,
} from '@heroui/react';
import {AgentType} from '@omnicraft/settings-schema';
import {Wrench} from 'lucide-react';

import {formatTransportSummary} from '../../helpers/format-transport-summary.js';
import type {McpServerRow} from '../../helpers/merge-servers.js';
import {RemoveServerButton} from '../RemoveServerButton/index.js';
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

          {toolCount > 0 && (
            <div className={styles.tools}>
              <span className={styles.toolsLabel}>
                {toolCount} {toolCount === 1 ? 'tool' : 'tools'}
              </span>
              <DisclosureGroup
                allowsMultipleExpanded
                className={styles.toolList}
              >
                {row.tools.map((tool) => (
                  <Disclosure
                    key={tool.name}
                    id={tool.name}
                    className={styles.tool}
                  >
                    <Disclosure.Heading>
                      <Disclosure.Trigger className={styles.toolTrigger}>
                        <Wrench size={14} className={styles.toolIcon} />
                        <span className={styles.toolName}>{tool.name}</span>
                        <Disclosure.Indicator
                          className={styles.toolIndicator}
                        />
                      </Disclosure.Trigger>
                    </Disclosure.Heading>
                    <Disclosure.Content>
                      <Disclosure.Body className={styles.toolBody}>
                        <p className={styles.toolDesc}>
                          {tool.description === ''
                            ? 'No description provided.'
                            : tool.description}
                        </p>
                      </Disclosure.Body>
                    </Disclosure.Content>
                  </Disclosure>
                ))}
              </DisclosureGroup>
            </div>
          )}
        </div>
      </Card.Content>
    </Card>
  );
}
