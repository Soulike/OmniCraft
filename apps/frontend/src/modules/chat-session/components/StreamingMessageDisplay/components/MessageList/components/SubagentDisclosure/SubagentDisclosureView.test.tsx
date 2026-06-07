import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import type {ReactNode, RefObject} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import type {ChatEventBus} from '../../../../types.js';
import {SubagentDisclosureView} from './SubagentDisclosureView.js';

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

vi.mock('../../../../StreamingMessageDisplay.js', () => ({
  StreamingMessageDisplay: () => null,
}));

vi.mock('../../../../../UsageInfo/index.js', () => ({
  UsageInfo: () => null,
}));

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

const scrollRef = {current: null} satisfies RefObject<HTMLDivElement | null>;
const eventBus = {} as ChatEventBus;

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('SubagentDisclosureView', () => {
  it('renders dispatch mode and subagent id copy', () => {
    render(
      <SubagentDisclosureView
        mode='dispatch'
        agentId='agent-dispatch-1'
        task='Search config files'
        agentType='general'
        thinkingLevel='none'
        workingDirectory='/tmp/project'
        status='running'
        eventBus={eventBus}
        scrollRef={scrollRef}
      />,
    );

    const trigger = screen.getByRole('button', {name: /Search config files/});
    expect(within(trigger).getByText('Dispatch')).toBeInTheDocument();

    fireEvent.click(trigger);

    expect(screen.getByText('Subagent ID')).toBeInTheDocument();
    expect(screen.getByText('agent-dispatch-1')).toBeInTheDocument();
  });

  it('renders resume mode and resumed subagent id copy', () => {
    render(
      <SubagentDisclosureView
        mode='resume'
        agentId='agent-resume-1'
        task='Continue config search'
        agentType='general'
        thinkingLevel='none'
        workingDirectory='/tmp/project'
        status='complete'
        eventBus={eventBus}
        scrollRef={scrollRef}
      />,
    );

    const trigger = screen.getByRole('button', {
      name: /Continue config search/,
    });
    expect(within(trigger).getByText('Resume')).toBeInTheDocument();

    fireEvent.click(trigger);

    expect(screen.getByText('Resumed subagent ID')).toBeInTheDocument();
    expect(screen.getByText('agent-resume-1')).toBeInTheDocument();
  });
});
