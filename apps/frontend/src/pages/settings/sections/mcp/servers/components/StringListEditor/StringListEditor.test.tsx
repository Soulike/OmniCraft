import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {StringListEditor} from './index.js';

afterEach(() => {
  cleanup();
});

describe('StringListEditor', () => {
  it('appends an empty row on add', () => {
    const onChange = vi.fn();
    render(
      <StringListEditor
        items={['-y']}
        addLabel='Add argument'
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', {name: 'Add argument'}));
    expect(onChange).toHaveBeenCalledWith(['-y', '']);
  });

  it('edits a row', () => {
    const onChange = vi.fn();
    render(
      <StringListEditor items={['-y']} addLabel='Add' onChange={onChange} />,
    );
    fireEvent.change(screen.getByRole('textbox', {name: 'Argument 1'}), {
      target: {value: '-x'},
    });
    expect(onChange).toHaveBeenCalledWith(['-x']);
  });

  it('removes a row', () => {
    const onChange = vi.fn();
    render(
      <StringListEditor
        items={['-y', '-x']}
        addLabel='Add'
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', {name: 'Remove argument 1'}));
    expect(onChange).toHaveBeenCalledWith(['-x']);
  });
});
