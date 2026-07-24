import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {ServerFormModal} from './index.js';

afterEach(() => {
  cleanup();
});

describe('ServerFormModal', () => {
  it('submits a new stdio server', () => {
    const onSubmit = vi.fn();
    render(
      <ServerFormModal
        isOpen
        mode='add'
        existingNames={[]}
        isSaving={false}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByRole('textbox', {name: 'Name'}), {
      target: {value: 'fs'},
    });
    fireEvent.change(screen.getByRole('textbox', {name: 'Command'}), {
      target: {value: 'npx'},
    });
    fireEvent.click(screen.getByRole('button', {name: 'Add'}));

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'fs',
      transport: {type: 'stdio', command: 'npx', args: [], env: {}},
    });
  });

  it('blocks a duplicate name and shows an error', () => {
    const onSubmit = vi.fn();
    render(
      <ServerFormModal
        isOpen
        mode='add'
        existingNames={['fs']}
        isSaving={false}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByRole('textbox', {name: 'Name'}), {
      target: {value: 'fs'},
    });
    fireEvent.change(screen.getByRole('textbox', {name: 'Command'}), {
      target: {value: 'npx'},
    });
    fireEvent.click(screen.getByRole('button', {name: 'Add'}));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/already exists/)).toBeInTheDocument();
  });

  it('disables the name field in edit mode', () => {
    render(
      <ServerFormModal
        isOpen
        mode='edit'
        initial={{
          name: 'fs',
          transport: {type: 'stdio', command: 'npx', args: [], env: {}},
        }}
        existingNames={[]}
        isSaving={false}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole('textbox', {name: 'Name'})).toBeDisabled();
  });
});
