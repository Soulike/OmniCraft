import {AgentType} from '@omnicraft/settings-schema';
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';

import type {McpServerRow} from '../../helpers/merge-servers.js';
import {ServerCard} from './index.js';

afterEach(() => {
  cleanup();
});

const baseRow: McpServerRow = {
  name: 'fs',
  transport: {type: 'stdio', command: 'npx', args: ['-y'], env: {}},
  enabledChat: false,
  enabledCoding: false,
  status: 'not-enabled',
  tools: [],
};

function renderCard(
  overrides: Partial<McpServerRow> = {},
  handlers: Partial<{
    onToggle: (a: AgentType, e: boolean) => void;
    onReconnect: () => void;
  }> = {},
) {
  render(
    <ServerCard
      row={{...baseRow, ...overrides}}
      isSaving={false}
      onToggle={handlers.onToggle ?? vi.fn()}
      onEdit={vi.fn()}
      onRemove={vi.fn()}
      onReconnect={handlers.onReconnect ?? vi.fn()}
    />,
  );
}

describe('ServerCard', () => {
  it('shows the name and transport summary', () => {
    renderCard();
    expect(screen.getByText('fs')).toBeInTheDocument();
    expect(screen.getByText('stdio · npx -y')).toBeInTheDocument();
  });

  it('hides reconnect for a not-enabled server', () => {
    renderCard({status: 'not-enabled'});
    expect(screen.queryByRole('button', {name: 'Reconnect'})).toBeNull();
  });

  it('shows reconnect for a connected server', () => {
    renderCard({status: 'connected', enabledChat: true});
    expect(screen.getByRole('button', {name: 'Reconnect'})).toBeInTheDocument();
  });

  it('toggles chat enablement', () => {
    const onToggle = vi.fn();
    renderCard({}, {onToggle});
    fireEvent.click(screen.getByRole('switch', {name: 'Chat'}));
    expect(onToggle).toHaveBeenCalledWith(AgentType.CHAT, true);
  });

  it('lists discovered tools when expanded', () => {
    renderCard({
      status: 'connected',
      enabledChat: true,
      tools: [{name: 'read_file', description: 'Read a file'}],
    });
    fireEvent.click(screen.getByRole('button', {name: /tool/}));
    expect(screen.getByText('read_file')).toBeInTheDocument();
  });

  it('shows the error reason for an error server', () => {
    renderCard({status: 'error', enabledChat: true, error: 'refused'});
    expect(screen.getByText('refused')).toBeInTheDocument();
  });
});
