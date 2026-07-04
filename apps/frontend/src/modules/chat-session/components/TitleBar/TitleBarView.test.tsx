import {cleanup, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it} from 'vitest';

import {TitleBarView} from './TitleBarView.js';

afterEach(cleanup);

describe('TitleBarView', () => {
  it('hides the new-session button when onNewSession is omitted', () => {
    render(<TitleBarView title='Hello' />);
    expect(
      screen.queryByRole('button', {name: 'New session'}),
    ).not.toBeInTheDocument();
  });

  it('shows the new-session button when onNewSession is provided', () => {
    render(<TitleBarView title='Hello' onNewSession={() => undefined} />);
    expect(
      screen.getByRole('button', {name: 'New session'}),
    ).toBeInTheDocument();
  });
});
