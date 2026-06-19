import type {SseTodoItem} from '@omnicraft/sse-events';
import {cleanup, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {TodoCardView} from './TodoCardView.js';

class ResizeObserverMock implements ResizeObserver {
  disconnect(): void {
    return undefined;
  }
  observe(): void {
    return undefined;
  }
  unobserve(): void {
    return undefined;
  }
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const items: SseTodoItem[] = [
  {index: 0, subject: 'Read code', description: 'd0', status: 'completed'},
  {index: 1, subject: 'Trace events', description: 'd1', status: 'completed'},
  {index: 2, subject: 'Wire the bus', description: 'd2', status: 'in_progress'},
  {index: 3, subject: 'Restyle', description: 'd3', status: 'pending'},
];

describe('TodoCardView', () => {
  it('shows the completed/total count', () => {
    render(<TodoCardView items={items} />);
    expect(screen.getByText('2/4')).toBeInTheDocument();
  });

  it('shows the current in-progress subject in the header', () => {
    render(<TodoCardView items={items} />);
    expect(screen.getByText('Wire the bus')).toBeInTheDocument();
  });

  it('renders no current subject when nothing is in progress', () => {
    const noActive: SseTodoItem[] = items.map((i) =>
      i.status === 'in_progress' ? {...i, status: 'pending'} : i,
    );
    render(<TodoCardView items={noActive} />);
    expect(screen.queryByTestId('todo-current')).not.toBeInTheDocument();
  });
});
