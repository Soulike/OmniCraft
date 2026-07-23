import {AgentType, type McpServer} from '@omnicraft/settings-schema';
import {useCallback, useEffect, useState} from 'react';

import {
  getMcpConfig,
  type McpConfig,
  type McpConfigUpdate,
  putMcpConfig,
} from '@/api/settings/mcp/index.js';

const EMPTY_CONFIG: McpConfig = {
  servers: [],
  enabledChat: [],
  enabledCoding: [],
};

export interface UseMcpConfig {
  config: McpConfig;
  isLoading: boolean;
  loadError: boolean;
  isSaving: boolean;
  addServer: (server: McpServer) => Promise<boolean>;
  updateServer: (server: McpServer) => Promise<boolean>;
  removeServer: (name: string) => Promise<boolean>;
  setEnabled: (
    name: string,
    agentType: AgentType,
    enabled: boolean,
  ) => Promise<boolean>;
  reload: () => Promise<void>;
}

export function useMcpConfig(): UseMcpConfig {
  const [config, setConfig] = useState<McpConfig>(EMPTY_CONFIG);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      setConfig(await getMcpConfig());
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
      setIsLoading(false);
    })();
  }, [load]);

  const save = useCallback(
    async (update: McpConfigUpdate): Promise<boolean> => {
      setIsSaving(true);
      try {
        await putMcpConfig(update);
        await load();
        return true;
      } catch {
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [load],
  );

  const addServer = useCallback(
    (server: McpServer) => save({servers: [...config.servers, server]}),
    [config.servers, save],
  );

  const updateServer = useCallback(
    (server: McpServer) =>
      save({
        servers: config.servers.map((existing) =>
          existing.name === server.name ? server : existing,
        ),
      }),
    [config.servers, save],
  );

  const removeServer = useCallback(
    (name: string) =>
      save({
        servers: config.servers.filter((server) => server.name !== name),
        enabledChat: config.enabledChat.filter((n) => n !== name),
        enabledCoding: config.enabledCoding.filter((n) => n !== name),
      }),
    [config, save],
  );

  const setEnabled = useCallback(
    (name: string, agentType: AgentType, enabled: boolean) => {
      if (agentType === AgentType.CHAT) {
        const next = enabled
          ? Array.from(new Set([...config.enabledChat, name]))
          : config.enabledChat.filter((n) => n !== name);
        return save({enabledChat: next});
      }
      const next = enabled
        ? Array.from(new Set([...config.enabledCoding, name]))
        : config.enabledCoding.filter((n) => n !== name);
      return save({enabledCoding: next});
    },
    [config, save],
  );

  return {
    config,
    isLoading,
    loadError,
    isSaving,
    addServer,
    updateServer,
    removeServer,
    setEnabled,
    reload: load,
  };
}
