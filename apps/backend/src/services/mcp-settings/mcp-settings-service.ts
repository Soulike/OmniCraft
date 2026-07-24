import {AgentType, type McpSettings} from '@omnicraft/settings-schema';

import {SettingsManager} from '@/models/settings-manager/index.js';

/** Service layer for persisting the MCP settings section. */
export const mcpSettingsService = {
  /**
   * Writes the whole `mcp` settings section atomically. Goes through a
   * dedicated endpoint rather than the generic scalar-only settings API
   * because the `servers`/`enabledByAgent` leaves are arrays, not scalars.
   */
  async setSettings(mcp: McpSettings): Promise<void> {
    await SettingsManager.getInstance().setBatch([
      {keyPath: ['mcp', 'servers'], value: mcp.servers},
      {
        keyPath: ['mcp', 'enabledByAgent', AgentType.CHAT],
        value: mcp.enabledByAgent[AgentType.CHAT],
      },
      {
        keyPath: ['mcp', 'enabledByAgent', AgentType.CODING],
        value: mcp.enabledByAgent[AgentType.CODING],
      },
    ]);
  },
};
