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

vi.mock('../../../UsageInfo/index.js', () => ({
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
  it('renders dispatch mode and the subagent name', () => {
    render(
      <SubagentDisclosureView
        mode='dispatch'
        agentId='agent-dispatch-1'
        nickname='crimson-otter'
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

    expect(screen.getByText('Subagent')).toBeInTheDocument();
    expect(screen.getByText('crimson-otter')).toBeInTheDocument();
  });

  it('renders resume mode and the resumed subagent name', () => {
    render(
      <SubagentDisclosureView
        mode='resume'
        agentId='agent-resume-1'
        nickname='silver-wren'
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

    expect(screen.getByText('Resumed subagent')).toBeInTheDocument();
    expect(screen.getByText('silver-wren')).toBeInTheDocument();
  });

  it('falls back to the agent id when no nickname is present', () => {
    render(
      <SubagentDisclosureView
        mode='dispatch'
        agentId='agent-dispatch-legacy'
        task='Legacy replay'
        agentType='general'
        thinkingLevel='none'
        workingDirectory='/tmp/project'
        status='complete'
        eventBus={eventBus}
        scrollRef={scrollRef}
      />,
    );

    fireEvent.click(screen.getByRole('button', {name: /Legacy replay/}));

    expect(screen.getByText('agent-dispatch-legacy')).toBeInTheDocument();
  });

  it('falls back to the agent id when the nickname is blank', () => {
    render(
      <SubagentDisclosureView
        mode='dispatch'
        agentId='agent-dispatch-blank'
        nickname='   '
        task='Blank nickname'
        agentType='general'
        thinkingLevel='none'
        workingDirectory='/tmp/project'
        status='complete'
        eventBus={eventBus}
        scrollRef={scrollRef}
      />,
    );

    fireEvent.click(screen.getByRole('button', {name: /Blank nickname/}));

    expect(screen.getByText('agent-dispatch-blank')).toBeInTheDocument();
  });

  it('renders the trimmed nickname when it has surrounding whitespace', () => {
    render(
      <SubagentDisclosureView
        mode='dispatch'
        agentId='agent-dispatch-padded'
        nickname='  crimson-otter  '
        task='Padded nickname'
        agentType='general'
        thinkingLevel='none'
        workingDirectory='/tmp/project'
        status='complete'
        eventBus={eventBus}
        scrollRef={scrollRef}
      />,
    );

    fireEvent.click(screen.getByRole('button', {name: /Padded nickname/}));

    expect(screen.getByText('crimson-otter')).toBeInTheDocument();
  });
});
