import {cleanup, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it} from 'vitest';

import {WORKING_WORDS} from '../WorkingIndicator/words.js';
import {RenderItem} from './RenderItem.js';

afterEach(() => {
  cleanup();
});

describe('RenderItem thinking', () => {
  it('shows the working indicator while thinking has no content yet', () => {
    render(<RenderItem item={{type: 'thinking', content: '', done: false}} />);

    const matched = WORKING_WORDS.some((w) => screen.queryByText(w) !== null);
    expect(matched).toBe(true);
  });

  it('renders the thinking block once content arrives', () => {
    render(
      <RenderItem
        item={{type: 'thinking', content: 'reasoning…', done: false}}
      />,
    );

    const matched = WORKING_WORDS.some((w) => screen.queryByText(w) !== null);
    expect(matched).toBe(false);
    expect(screen.getByText('reasoning…')).toBeInTheDocument();
  });
});
