import {AgentType, type McpSettings} from '@omnicraft/settings-schema';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const {setBatch} = vi.hoisted(() => ({
  setBatch: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/models/settings-manager/index.js', () => ({
  SettingsManager: {getInstance: () => ({setBatch})},
}));

import {mcpSettingsService} from './mcp-settings-service.js';

describe('mcpSettingsService.setSettings', () => {
  beforeEach(() => {
    setBatch.mockClear();
  });

  it('writes servers and per-agent enablement as three leaf key paths', async () => {
    const mcp: McpSettings = {
      servers: [
        {
          name: 'fs',
          transport: {type: 'stdio', command: 'npx', args: [], env: {}},
        },
      ],
      enabledByAgent: {[AgentType.CHAT]: ['fs'], [AgentType.CODING]: []},
    };

    await mcpSettingsService.setSettings(mcp);

    expect(setBatch).toHaveBeenCalledTimes(1);
    expect(setBatch).toHaveBeenCalledWith([
      {keyPath: ['mcp', 'servers'], value: mcp.servers},
      {keyPath: ['mcp', 'enabledByAgent', AgentType.CHAT], value: ['fs']},
      {keyPath: ['mcp', 'enabledByAgent', AgentType.CODING], value: []},
    ]);
  });
});
