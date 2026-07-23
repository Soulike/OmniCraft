import {Button, Skeleton} from '@heroui/react';
import type {AgentType, McpServer} from '@omnicraft/settings-schema';

import {LoadError} from '@/components/LoadError/index.js';

import {ServerFormModal} from './components/ServerFormModal/index.js';
import {ServerList} from './components/ServerList/index.js';
import type {McpServerRow} from './helpers/merge-servers.js';
import type {UseServerFormModal} from './hooks/useServerFormModal.js';
import styles from './styles.module.css';

interface McpServersSectionViewProps {
  isLoading: boolean;
  loadError: boolean;
  statusUnavailable: boolean;
  isSaving: boolean;
  rows: McpServerRow[];
  modal: UseServerFormModal;
  existingNames: string[];
  onAddClick: () => void;
  onReload: () => void;
  onSubmitServer: (server: McpServer) => void;
  onToggle: (name: string, agentType: AgentType, enabled: boolean) => void;
  onEdit: (name: string) => void;
  onRemove: (name: string) => void;
  onReconnect: (name: string) => void;
}

export function McpServersSectionView({
  isLoading,
  loadError,
  statusUnavailable,
  isSaving,
  rows,
  modal,
  existingNames,
  onAddClick,
  onReload,
  onSubmitServer,
  onToggle,
  onEdit,
  onRemove,
  onReconnect,
}: McpServersSectionViewProps) {
  return (
    <div className={styles.section}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>MCP Servers</h2>
          <p className={styles.subtitle}>
            Connect external Model Context Protocol tool servers and choose
            which agents may use each one.
          </p>
        </div>
        <Button
          variant='primary'
          isDisabled={isLoading || isSaving}
          onPress={onAddClick}
        >
          Add server
        </Button>
      </div>

      {loadError ? (
        <LoadError message='Failed to load MCP settings.' onRetry={onReload} />
      ) : isLoading ? (
        <div className={styles.skeletons}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className={styles.skeletonRow} />
          ))}
        </div>
      ) : (
        <>
          {statusUnavailable && (
            <p className={styles.statusNote}>
              Live status is unavailable. Showing your saved configuration.
            </p>
          )}
          <ServerList
            rows={rows}
            isSaving={isSaving}
            onToggle={onToggle}
            onEdit={onEdit}
            onRemove={onRemove}
            onReconnect={onReconnect}
          />
        </>
      )}

      <ServerFormModal
        key={modal.instanceId}
        isOpen={modal.isOpen}
        mode={modal.mode}
        initial={modal.target}
        existingNames={existingNames}
        isSaving={isSaving}
        onSubmit={onSubmitServer}
        onClose={modal.close}
      />
    </div>
  );
}
