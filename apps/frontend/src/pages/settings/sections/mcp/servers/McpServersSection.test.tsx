import type {McpTransport} from '@omnicraft/settings-schema';
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {getMcpServers, reconnectMcpServer} from '@/api/mcp/index.js';
import {getMcpConfig, putMcpConfig} from '@/api/settings/mcp/index.js';

import {McpServersSection} from './index.js';

vi.mock('@/api/mcp/index.js');
vi.mock('@/api/settings/mcp/index.js');

const stdio: McpTransport = {type: 'stdio', command: 'npx', args: [], env: {}};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getMcpConfig).mockResolvedValue({
    servers: [{name: 'fs', transport: stdio}],
    enabledChat: ['fs'],
    enabledCoding: [],
  });
  vi.mocked(putMcpConfig).mockResolvedValue(undefined);
  vi.mocked(getMcpServers).mockResolvedValue([
    {name: 'fs', transportType: 'stdio', status: 'connected', tools: []},
  ]);
  vi.mocked(reconnectMcpServer).mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
});

describe('McpServersSection', () => {
  it('renders configured servers after loading', async () => {
    render(<McpServersSection />);
    expect(await screen.findByText('fs')).toBeInTheDocument();
    expect(screen.getByText('connected')).toBeInTheDocument();
  });

  it('opens the add modal', async () => {
    render(<McpServersSection />);
    await screen.findByText('fs');
    fireEvent.click(screen.getByRole('button', {name: 'Add server'}));
    expect(await screen.findByText('Add MCP server')).toBeInTheDocument();
  });
});
