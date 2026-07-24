import {act, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {AnimateHeight} from './index.js';

describe('AnimateHeight', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders its children', () => {
    render(
      <AnimateHeight>
        <p>inner content</p>
      </AnimateHeight>,
    );
    expect(screen.getByText('inner content')).toBeInTheDocument();
  });

  it('applies the measured content height when the content resizes', () => {
    // Controllable ResizeObserver: capture the callback so the test can fire it.
    let fire: (() => void) | undefined;
    class ControllableResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        fire = () => {
          callback([], this);
        };
      }
      observe(): void {
        /* no-op */
      }
      unobserve(): void {
        /* no-op */
      }
      disconnect(): void {
        /* no-op */
      }
    }
    vi.stubGlobal('ResizeObserver', ControllableResizeObserver);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      height: 120,
    } as DOMRect);

    const {container} = render(
      <AnimateHeight>
        <p>content</p>
      </AnimateHeight>,
    );
    const outer = container.firstElementChild as HTMLElement;

    // Starts at auto (nothing measured yet).
    expect(outer.style.height).toBe('auto');

    // A resize applies the measured height so the transition has a target.
    act(() => {
      fire?.();
    });
    expect(outer.style.height).toBe('120px');
  });
});
