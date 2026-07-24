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
        entries={[{key: 'NODE_ENV', value: 'production'}]}
        addLabel='Add variable'
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', {name: 'Add variable'}));
    expect(onChange).toHaveBeenCalledWith([
      {key: 'NODE_ENV', value: 'production'},
      {key: '', value: ''},
    ]);
  });

  it('edits a key and a value independently', () => {
    const onChange = vi.fn();
    render(
      <KeyValueEditor
        entries={[{key: 'A', value: 'b'}]}
        addLabel='Add'
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByRole('textbox', {name: 'Key 1'}), {
      target: {value: 'TOKEN'},
    });
    expect(onChange).toHaveBeenLastCalledWith([{key: 'TOKEN', value: 'b'}]);
    fireEvent.change(screen.getByRole('textbox', {name: 'Value 1'}), {
      target: {value: 'secret'},
    });
    expect(onChange).toHaveBeenLastCalledWith([{key: 'A', value: 'secret'}]);
  });

  it('removes a pair', () => {
    const onChange = vi.fn();
    render(
      <KeyValueEditor
        entries={[
          {key: 'A', value: 'b'},
          {key: 'C', value: 'd'},
        ]}
        addLabel='Add'
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', {name: 'Remove pair 1'}));
    expect(onChange).toHaveBeenCalledWith([{key: 'C', value: 'd'}]);
  });
});
