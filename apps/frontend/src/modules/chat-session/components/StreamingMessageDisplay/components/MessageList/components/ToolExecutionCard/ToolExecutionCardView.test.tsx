import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import type {ReactNode} from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {ToolExecutionCardView} from './ToolExecutionCardView.js';

vi.mock('@heroui/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@heroui/react')>();
  return {
    ...actual,
    ScrollShadow: ({
      children,
      className,
    }: {
      children?: ReactNode;
      className?: string;
    }) => <div className={className}>{children}</div>,
  };
});

vi.mock('./components/ResultSection/index.js', () => ({
  ResultSection: () => null,
}));

afterEach(() => {
  cleanup();
});

describe('ToolExecutionCardView', () => {
  it('renders display name, adapter target, and adapter detail for run_command', () => {
    render(
      <ToolExecutionCardView
        arguments={JSON.stringify({command: 'bun test', timeout: 30000})}
        displayName='Run command'
        status='done'
        toolName='run_command'
      />,
    );

    expect(screen.getByText('Run command')).toBeInTheDocument();
    expect(screen.getByText('bun test')).toBeInTheDocument();
    expect(screen.getByText('30s timeout')).toBeInTheDocument();
  });

  it('keeps details collapsed by default and shows them after expanding', () => {
    render(
      <ToolExecutionCardView
        arguments={JSON.stringify({command: 'bun test', timeout: 30000})}
        displayName='Run command'
        output='watching files...'
        status='running'
        toolName='run_command'
      />,
    );

    const trigger = screen.getByRole('button', {name: /Run command/});
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    const content = screen.getByRole('group', {hidden: true});
    expect(content).toHaveAttribute('aria-hidden', 'true');

    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(content).not.toHaveAttribute('aria-hidden', 'true');
    expect(within(content).getByText('Tool')).toBeInTheDocument();
    expect(within(content).getByText('run_command')).toBeInTheDocument();
    expect(within(content).getByText('Parameters')).toBeInTheDocument();
    expect(
      within(content).getByText(
        (_, element) => element?.textContent === '$ bun test',
      ),
    ).toBeInTheDocument();
    expect(within(content).getByText('Output')).toBeInTheDocument();
    expect(within(content).getByText('watching files...')).toBeInTheDocument();
  });
});
