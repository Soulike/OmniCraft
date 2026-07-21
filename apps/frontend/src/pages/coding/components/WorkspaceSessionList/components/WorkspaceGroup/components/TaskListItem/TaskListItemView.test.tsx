import {cleanup, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it} from 'vitest';

import {TaskListItemView} from './TaskListItemView.js';

afterEach(() => {
  cleanup();
});

const baseProps = {
  title: 'Fix the thing',
  timeLabel: '2h ago' as string | null,
  isSelected: false,
  isDeleteOpen: false,
  onDeleteOpenChange: () => undefined,
  onConfirmDelete: () => undefined,
  isDeleting: false,
};

describe('TaskListItemView', () => {
  it('renders the title and time label', () => {
    render(<TaskListItemView {...baseProps} />);
    expect(screen.getByText('Fix the thing')).toBeInTheDocument();
    expect(screen.getByText('2h ago')).toBeInTheDocument();
  });

  it('omits the meta line when timeLabel is null', () => {
    render(<TaskListItemView {...baseProps} timeLabel={null} />);
    expect(screen.getByText('Fix the thing')).toBeInTheDocument();
    expect(screen.queryByText('2h ago')).not.toBeInTheDocument();
  });

  it('exposes a delete button', () => {
    render(<TaskListItemView {...baseProps} />);
    expect(
      screen.getByRole('button', {name: 'Delete task'}),
    ).toBeInTheDocument();
  });
});
