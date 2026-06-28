import {cleanup, render, screen} from '@testing-library/react';
import {MemoryRouter} from 'react-router';
import {afterEach, describe, expect, it} from 'vitest';

import {WorkspaceSessionListView} from './WorkspaceSessionListView.js';

afterEach(() => {
  cleanup();
});

const noop = () => undefined;
const asyncNoop = () => Promise.resolve();

describe('WorkspaceSessionListView', () => {
  it('renders one group per entry and a Manage workspaces link', () => {
    render(
      <MemoryRouter>
        <WorkspaceSessionListView
          entries={[
            {key: '/a', group: {workspace: {path: '/a'}, sessions: []}},
            {key: '/b', group: {workspace: {path: '/b'}, sessions: []}},
          ]}
          expanded={new Set()}
          isLoading={false}
          error={null}
          currentSessionId={null}
          onToggle={noop}
          onSelectSession={noop}
          onDeleteSession={asyncNoop}
          onNewSession={noop}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('a')).toBeInTheDocument();
    expect(screen.getByText('b')).toBeInTheDocument();
    expect(
      screen.getByRole('link', {name: /manage workspaces/i}),
    ).toBeInTheDocument();
  });
});
