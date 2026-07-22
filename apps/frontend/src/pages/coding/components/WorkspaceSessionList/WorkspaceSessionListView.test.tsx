import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {MemoryRouter} from 'react-router';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {WorkspaceSessionListView} from './WorkspaceSessionListView.js';

afterEach(() => {
  cleanup();
});

const noop = () => undefined;
const asyncNoop = () => Promise.resolve();

const baseProps = {
  expanded: new Set<string>(),
  isLoading: false,
  workspacesFailed: false,
  sessionsFailed: false,
  currentSessionId: null,
  now: 1_700_000_000_000,
  statuses: new Map(),
  onReloadWorkspaces: noop,
  onReloadSessions: noop,
  onToggle: noop,
  onSelectSession: noop,
  onDeleteSession: asyncNoop,
  onNewSession: noop,
};

describe('WorkspaceSessionListView', () => {
  it('renders one group per entry and a Manage workspaces link', () => {
    render(
      <MemoryRouter>
        <WorkspaceSessionListView
          {...baseProps}
          entries={[
            {key: '/a', group: {workspace: {path: '/a'}, sessions: []}},
            {key: '/b', group: {workspace: {path: '/b'}, sessions: []}},
          ]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('a')).toBeInTheDocument();
    expect(screen.getByText('b')).toBeInTheDocument();
    expect(
      screen.getByRole('link', {name: /manage workspaces/i}),
    ).toBeInTheDocument();
  });

  it('shows a workspaces failure with retry, hiding groups', () => {
    const onReloadWorkspaces = vi.fn();
    render(
      <MemoryRouter>
        <WorkspaceSessionListView
          {...baseProps}
          entries={[]}
          workspacesFailed
          onReloadWorkspaces={onReloadWorkspaces}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('Failed to load workspaces')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: /try again/i}));
    expect(onReloadWorkspaces).toHaveBeenCalledOnce();
  });

  it('shows a sessions failure with retry, hiding groups', () => {
    const onReloadSessions = vi.fn();
    render(
      <MemoryRouter>
        <WorkspaceSessionListView
          {...baseProps}
          entries={[
            {key: '/a', group: {workspace: {path: '/a'}, sessions: []}},
          ]}
          sessionsFailed
          onReloadSessions={onReloadSessions}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('Failed to load sessions')).toBeInTheDocument();
    expect(screen.queryByText('a')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: /try again/i}));
    expect(onReloadSessions).toHaveBeenCalledOnce();
  });

  it('renders groups when nothing has failed', () => {
    render(
      <MemoryRouter>
        <WorkspaceSessionListView
          {...baseProps}
          entries={[
            {key: '/a', group: {workspace: {path: '/a'}, sessions: []}},
          ]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('a')).toBeInTheDocument();
  });
});
