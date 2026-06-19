import {cleanup, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it} from 'vitest';

import {StatusTimeline} from './StatusTimeline.js';

afterEach(cleanup);

describe('StatusTimeline', () => {
  it('renders one node per item with its status as data-status', () => {
    render(
      <StatusTimeline
        items={[
          {status: 'done', content: 'First'},
          {status: 'in-progress', content: 'Second'},
          {status: 'pending', content: 'Third'},
        ]}
      />,
    );
    const nodes = screen.getAllByTestId('status-node');
    expect(nodes).toHaveLength(3);
    expect(nodes[0]).toHaveAttribute('data-status', 'done');
    expect(nodes[1]).toHaveAttribute('data-status', 'in-progress');
    expect(nodes[2]).toHaveAttribute('data-status', 'pending');
  });

  it('renders caller-supplied row content', () => {
    render(
      <StatusTimeline
        items={[{status: 'pending', content: <span>Hello row</span>}]}
      />,
    );
    expect(screen.getByText('Hello row')).toBeInTheDocument();
  });

  it('renders nothing when there are no items', () => {
    const {container} = render(<StatusTimeline items={[]} />);
    expect(
      container.querySelectorAll('[data-testid="status-node"]'),
    ).toHaveLength(0);
  });
});
