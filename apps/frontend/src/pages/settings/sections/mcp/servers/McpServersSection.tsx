import {toast} from '@heroui/react';
import type {AgentType, McpServer} from '@omnicraft/settings-schema';
import {useCallback, useMemo} from 'react';

import {mergeServers} from './helpers/merge-servers.js';
import {useMcpConfig} from './hooks/useMcpConfig.js';
import {useMcpStatus} from './hooks/useMcpStatus.js';
import {useServerFormModal} from './hooks/useServerFormModal.js';
import {McpServersSectionView} from './McpServersSectionView.js';

export function McpServersSection() {
  const config = useMcpConfig();
  const status = useMcpStatus();
  const modal = useServerFormModal();

  const rows = useMemo(
    () => mergeServers(config.config, status.statuses),
    [config.config, status.statuses],
  );

  const existingNames = useMemo(() => {
    const names = config.config.servers.map((server) => server.name);
    if (modal.mode === 'edit' && modal.target) {
      const editedName = modal.target.name;
      return names.filter((name) => name !== editedName);
    }
    return names;
  }, [config.config.servers, modal.mode, modal.target]);

  const handleSubmit = useCallback(
    async (server: McpServer) => {
      const ok =
        modal.mode === 'edit'
          ? await config.updateServer(server)
          : await config.addServer(server);
      if (ok) {
        toast.success(
          modal.mode === 'edit' ? 'Server updated' : 'Server added',
        );
        modal.close();
        void status.refetch();
      } else {
        toast.danger('Failed to save server');
      }
    },
    [modal, config, status],
  );

  const handleToggle = useCallback(
    async (name: string, agentType: AgentType, enabled: boolean) => {
      const ok = await config.setEnabled(name, agentType, enabled);
      if (ok) {
        void status.refetch();
      } else {
        toast.danger('Failed to update enablement');
      }
    },
    [config, status],
  );

  const handleRemove = useCallback(
    async (name: string) => {
      const ok = await config.removeServer(name);
      if (ok) {
        toast.success('Server removed');
        void status.refetch();
      } else {
        toast.danger('Failed to remove server');
      }
    },
    [config, status],
  );

  const handleReconnect = useCallback(
    async (name: string) => {
      try {
        await status.reconnect(name);
      } catch {
        toast.danger('Failed to reconnect');
      }
    },
    [status],
  );

  const handleEdit = useCallback(
    (name: string) => {
      const server = config.config.servers.find((s) => s.name === name);
      if (server) {
        modal.openEdit(server);
      }
    },
    [config.config.servers, modal],
  );

  return (
    <McpServersSectionView
      isLoading={config.isLoading}
      loadError={config.loadError}
      statusUnavailable={status.loadError}
      isSaving={config.isSaving}
      rows={rows}
      modal={modal}
      existingNames={existingNames}
      onAddClick={modal.openAdd}
      onReload={() => {
        void config.reload();
      }}
      onSubmitServer={(server) => {
        void handleSubmit(server);
      }}
      onToggle={(name, agentType, enabled) => {
        void handleToggle(name, agentType, enabled);
      }}
      onEdit={handleEdit}
      onRemove={(name) => {
        void handleRemove(name);
      }}
      onReconnect={(name) => {
        void handleReconnect(name);
      }}
    />
  );
}
