import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {ThinkingBlock} from './ThinkingBlock.js';

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
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    return window.setTimeout(() => {
      callback(0);
    }, 0);
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    window.clearTimeout(id);
  });
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ThinkingBlock', () => {
  it('stays expanded when thinking finishes', () => {
    const {rerender} = render(
      <ThinkingBlock content='Inspect the replay path.' done={false} />,
    );

    expect(screen.getByRole('button', {name: /Thinking/})).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    rerender(<ThinkingBlock content='Inspect the replay path.' done />);

    expect(screen.getByRole('button', {name: /Thought/})).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByText('Inspect the replay path.')).toBeInTheDocument();
  });

  it('does not reopen user-collapsed thinking when thinking finishes', () => {
    const {rerender} = render(
      <ThinkingBlock content='Inspect the replay path.' done={false} />,
    );

    fireEvent.click(screen.getByRole('button', {name: /Thinking/}));

    expect(screen.getByRole('button', {name: /Thinking/})).toHaveAttribute(
      'aria-expanded',
      'false',
    );

    rerender(<ThinkingBlock content='Inspect the replay path.' done />);

    expect(screen.getByRole('button', {name: /Thought/})).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });
});
