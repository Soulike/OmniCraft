import type {McpServerStatusResponse} from '@omnicraft/api-schema';
import {describe, expect, it} from 'vitest';

import type {McpConfig} from '@/api/settings/mcp/index.js';

import {mergeServers} from './merge-servers.js';

const stdio = (command: string) =>
  ({type: 'stdio', command, args: [], env: {}}) as const;

const config: McpConfig = {
  servers: [
    {name: 'fs', transport: stdio('npx')},
    {
      name: 'remote',
      transport: {type: 'http', url: 'https://x.example', headers: {}},
    },
    {name: 'scratch', transport: stdio('node')},
  ],
  enabledChat: ['fs'],
  enabledCoding: ['fs', 'remote'],
};

const statuses: McpServerStatusResponse[] = [
  {
    name: 'fs',
    transportType: 'stdio',
    status: 'connected',
    tools: [{name: 'read_file', description: 'r'}],
  },
  {
    name: 'remote',
    transportType: 'http',
    status: 'error',
    tools: [],
    error: 'refused',
  },
];

describe('mergeServers', () => {
  it('joins config + status by name and preserves config order', () => {
    const rows = mergeServers(config, statuses);
    expect(rows.map((r) => r.name)).toEqual(['fs', 'remote', 'scratch']);
  });

  it('carries live status, tools, error, and enablement flags', () => {
    const [fs, remote] = mergeServers(config, statuses);
    expect(fs).toMatchObject({
      status: 'connected',
      enabledChat: true,
      enabledCoding: true,
      tools: [{name: 'read_file', description: 'r'}],
    });
    expect(remote).toMatchObject({
      status: 'error',
      enabledChat: false,
      enabledCoding: true,
      error: 'refused',
    });
  });

  it('marks a server enabled for no agent as not-enabled', () => {
    const scratch = mergeServers(config, statuses)[2];
    expect(scratch.status).toBe('not-enabled');
    expect(scratch.tools).toEqual([]);
  });

  it('marks an enabled server missing from status as unknown', () => {
    // fs is enabled but no status entry present
    const rows = mergeServers(config, [statuses[1]]);
    expect(rows.find((r) => r.name === 'fs')?.status).toBe('unknown');
  });

  it('treats a null status list as unavailable (enabled -> unknown, else not-enabled)', () => {
    const rows = mergeServers(config, null);
    expect(rows.find((r) => r.name === 'fs')?.status).toBe('unknown');
    expect(rows.find((r) => r.name === 'scratch')?.status).toBe('not-enabled');
  });
});
