import {cleanup, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it} from 'vitest';

import {AssistantMessageView} from '../AssistantMessage/AssistantMessageView.js';
import {UserMessageView} from '../UserMessage/UserMessageView.js';
import {WORKING_WORDS} from './words.js';
import {WorkingIndicatorView} from './WorkingIndicatorView.js';

afterEach(() => {
  cleanup();
});

describe('WorkingIndicatorView', () => {
  it('renders the given word', () => {
    render(<WorkingIndicatorView word='Brewing…' />);
    expect(screen.getByText('Brewing…')).toBeInTheDocument();
  });

  it('uses a word that exists in the shared list', () => {
    const word = WORKING_WORDS[0];
    render(<WorkingIndicatorView word={word} />);
    expect(screen.getByText(word)).toBeInTheDocument();
  });
});

describe('message empty state', () => {
  it('shows a working word for an empty assistant message', () => {
    render(<AssistantMessageView content='' theme='dark' />);
    const matched = WORKING_WORDS.some((w) => screen.queryByText(w) !== null);
    expect(matched).toBe(true);
  });

  it('does not show a working word for an empty user message', () => {
    render(<UserMessageView content='' />);
    const matched = WORKING_WORDS.some((w) => screen.queryByText(w) !== null);
    expect(matched).toBe(false);
  });
});
