import {cleanup, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {WorkspaceGroupView} from './WorkspaceGroupView.js';

afterEach(() => {
  cleanup();
});

const noop = () => undefined;
const asyncNoop = () => Promise.resolve();

describe('WorkspaceGroupView', () => {
  it('shows the basename, count, and a New task button for a workspace', () => {
    render(
      <WorkspaceGroupView
        workspace={{path: '/home/me/proj'}}
        sessions={[{id: 's1', title: 'One'}]}
        isExpanded
        onExpandedChange={noop}
        currentSessionId={null}
        now={1_700_000_000_000}
        onSelectSession={noop}
        onDeleteSession={asyncNoop}
        onNewSession={vi.fn()}
      />,
    );
    expect(screen.getByText('proj')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(
      screen.getByRole('button', {name: 'New task in proj'}),
    ).toBeInTheDocument();
  });

  it('renders the Ungrouped label with no New task button and an empty hint', () => {
    render(
      <WorkspaceGroupView
        sessions={[]}
        isExpanded
        onExpandedChange={noop}
        currentSessionId={null}
        now={1_700_000_000_000}
        onSelectSession={noop}
        onDeleteSession={asyncNoop}
      />,
    );
    expect(screen.getByText('Ungrouped')).toBeInTheDocument();
    expect(screen.getByText('No tasks yet')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {name: /New task/}),
    ).not.toBeInTheDocument();
  });
});
