import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {KeyValueEditor} from './index.js';

afterEach(() => {
  cleanup();
});

describe('KeyValueEditor', () => {
  it('appends an empty pair on add', () => {
    const onChange = vi.fn();
    render(
      <KeyValueEditor
        entries={[['NODE_ENV', 'production']]}
        addLabel='Add variable'
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', {name: 'Add variable'}));
    expect(onChange).toHaveBeenCalledWith([
      ['NODE_ENV', 'production'],
      ['', ''],
    ]);
  });

  it('edits a key and a value independently', () => {
    const onChange = vi.fn();
    render(
      <KeyValueEditor
        entries={[['A', 'b']]}
        addLabel='Add'
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByRole('textbox', {name: 'Key 1'}), {
      target: {value: 'TOKEN'},
    });
    expect(onChange).toHaveBeenLastCalledWith([['TOKEN', 'b']]);
    fireEvent.change(screen.getByRole('textbox', {name: 'Value 1'}), {
      target: {value: 'secret'},
    });
    expect(onChange).toHaveBeenLastCalledWith([['A', 'secret']]);
  });

  it('removes a pair', () => {
    const onChange = vi.fn();
    render(
      <KeyValueEditor
        entries={[
          ['A', 'b'],
          ['C', 'd'],
        ]}
        addLabel='Add'
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', {name: 'Remove pair 1'}));
    expect(onChange).toHaveBeenCalledWith([['C', 'd']]);
  });
});
