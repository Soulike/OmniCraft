import {render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';

import {UnsupportedNotice} from './index.js';

describe('UnsupportedNotice', () => {
  it('renders the unsupported-session copy', () => {
    render(<UnsupportedNotice />);

    expect(
      screen.getByText("This session can't accept answers."),
    ).toBeInTheDocument();
  });
});
