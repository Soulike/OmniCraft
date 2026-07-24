import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it} from 'vitest';

import {ServerToolList} from './index.js';

describe('ServerToolList', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders nothing when there are no tools', () => {
    const {container} = render(<ServerToolList tools={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('reveals the tools when the summary is expanded', () => {
    render(
      <ServerToolList
        tools={[{name: 'read_file', description: 'Read a file'}]}
      />,
    );
    fireEvent.click(screen.getByRole('button', {name: /tool/}));
    expect(screen.getByText('read_file')).toBeInTheDocument();
  });
});
