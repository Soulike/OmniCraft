import {render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';

import {SubmitErrorNotice} from './index.js';

describe('SubmitErrorNotice', () => {
  it('renders the submit-failure copy', () => {
    render(<SubmitErrorNotice />);

    expect(
      screen.getByText("Couldn't reach the server. Try again."),
    ).toBeInTheDocument();
  });
});
