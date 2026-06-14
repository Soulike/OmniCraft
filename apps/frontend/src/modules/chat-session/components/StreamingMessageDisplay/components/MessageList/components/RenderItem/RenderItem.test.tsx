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

describe('RenderItem assistant-text', () => {
  it('does not show a timestamp for an empty waiting bubble', () => {
    render(
      <RenderItem
        item={{
          type: 'assistant-text',
          id: 'msg-1',
          content: '',
          createdAt: 1_700_000_000_000,
        }}
      />,
    );

    expect(document.querySelector('time')).toBeNull();
  });

  it('shows a timestamp once content has arrived', () => {
    render(
      <RenderItem
        item={{
          type: 'assistant-text',
          id: 'msg-1',
          content: 'done',
          createdAt: 1_700_000_000_000,
        }}
      />,
    );

    expect(document.querySelector('time')).not.toBeNull();
  });
});
