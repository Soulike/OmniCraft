import {fireEvent, render, screen} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';

import {NewSessionModal} from './NewSessionModal.js';

describe('NewSessionModal', () => {
  it('submits the typed task for the target workspace', () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <NewSessionModal
        workspace='/home/me/proj'
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByText('New task in proj')).toBeInTheDocument();
    const startButton = screen.getByRole('button', {name: 'Start task'});
    expect(startButton).toBeDisabled();

    fireEvent.change(screen.getByRole('textbox', {name: 'Task'}), {
      target: {value: 'Refactor the sidebar'},
    });
    expect(startButton).not.toBeDisabled();
    fireEvent.click(startButton);

    expect(onSubmit).toHaveBeenCalledWith('Refactor the sidebar');
  });
});
