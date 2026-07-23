import {cleanup, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';

import type {McpServerRow} from '../../helpers/merge-servers.js';
import {ServerList} from './index.js';

const noop = vi.fn();

function props(rows: McpServerRow[]) {
  return {
    rows,
    isSaving: false,
    onToggle: noop,
    onEdit: noop,
    onRemove: noop,
    onReconnect: noop,
  };
}

describe('ServerList', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows an empty state when there are no servers', () => {
    render(<ServerList {...props([])} />);
    expect(
      screen.getByText('No MCP servers configured yet.'),
    ).toBeInTheDocument();
  });

  it('renders a card per server', () => {
    const rows: McpServerRow[] = [
      {
        name: 'fs',
        transport: {type: 'stdio', command: 'npx', args: [], env: {}},
        enabledChat: false,
        enabledCoding: false,
        status: 'not-enabled',
        tools: [],
      },
    ];
    render(<ServerList {...props(rows)} />);
    expect(screen.getByText('fs')).toBeInTheDocument();
  });
});
