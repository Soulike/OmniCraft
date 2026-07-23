import {render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';

import {StatusChip} from './index.js';

describe('StatusChip', () => {
  it('renders the connected label', () => {
    render(<StatusChip status='connected' />);
    expect(screen.getByText('connected')).toBeInTheDocument();
  });

  it('renders the not-enabled label', () => {
    render(<StatusChip status='not-enabled' />);
    expect(screen.getByText('not enabled')).toBeInTheDocument();
  });
});
