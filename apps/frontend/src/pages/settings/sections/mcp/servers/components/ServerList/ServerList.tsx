import {Alert} from '@heroui/react';
import type {AgentType} from '@omnicraft/settings-schema';

import type {McpServerRow} from '../../helpers/merge-servers.js';
import {ServerCard} from '../ServerCard/index.js';
import styles from './styles.module.css';

interface ServerListProps {
  rows: McpServerRow[];
  isSaving: boolean;
  onToggle: (name: string, agentType: AgentType, enabled: boolean) => void;
  onEdit: (name: string) => void;
  onRemove: (name: string) => void;
  onReconnect: (name: string) => void;
}

export function ServerList({
  rows,
  isSaving,
  onToggle,
  onEdit,
  onRemove,
  onReconnect,
}: ServerListProps) {
  if (rows.length === 0) {
    return (
      <Alert>
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>No MCP servers configured yet</Alert.Title>
          <Alert.Description>
            Add a server to make its tools available to the chat and coding
            agents.
          </Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }

  return (
    <div className={styles.list}>
      {rows.map((row) => (
        <ServerCard
          key={row.name}
          row={row}
          isSaving={isSaving}
          onToggle={(agentType, enabled) => {
            onToggle(row.name, agentType, enabled);
          }}
          onEdit={() => {
            onEdit(row.name);
          }}
          onRemove={() => {
            onRemove(row.name);
          }}
          onReconnect={() => {
            onReconnect(row.name);
          }}
        />
      ))}
    </div>
  );
}
