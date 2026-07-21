import {cleanup, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it} from 'vitest';

import {TaskStatusIndicator} from './TaskStatusIndicator.js';

afterEach(cleanup);

describe('TaskStatusIndicator', () => {
  it('exposes the status via data-status', () => {
    render(<TaskStatusIndicator status='idle' />);
    expect(screen.getByTestId('task-status-indicator')).toHaveAttribute(
      'data-status',
      'idle',
    );
  });

  it('renders a spinner for running and no ripples', () => {
    const {container} = render(<TaskStatusIndicator status='running' />);
    expect(container.querySelector('[data-part="spinner"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-part="ripple"]')).toHaveLength(0);
  });

  it('renders two ripples for done and waiting', () => {
    const {container: done} = render(<TaskStatusIndicator status='done' />);
    expect(done.querySelectorAll('[data-part="ripple"]')).toHaveLength(2);
    cleanup();
    const {container: waiting} = render(
      <TaskStatusIndicator status='waiting' />,
    );
    expect(waiting.querySelectorAll('[data-part="ripple"]')).toHaveLength(2);
  });

  it('labels attention states for assistive tech', () => {
    render(<TaskStatusIndicator status='waiting' />);
    expect(screen.getByLabelText('Needs your input')).toBeInTheDocument();
  });
});
