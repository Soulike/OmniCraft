import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {RemoveServerButton} from './index.js';

describe('RemoveServerButton', () => {
  afterEach(() => {
    cleanup();
  });

  it('removes only after the confirmation is accepted', () => {
    const onConfirm = vi.fn();
    render(
      <RemoveServerButton
        serverName='fs'
        isDisabled={false}
        onConfirm={onConfirm}
      />,
    );

    // Trigger does not remove immediately; the confirmation opens.
    fireEvent.click(screen.getByRole('button', {name: 'Remove'}));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole('button', {name: 'Cancel'})).toBeInTheDocument();

    // Confirm (the second "Remove" — the one inside the popover).
    const buttons = screen.getAllByRole('button', {name: 'Remove'});
    fireEvent.click(buttons[buttons.length - 1]);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('does not remove when cancelled', () => {
    const onConfirm = vi.fn();
    render(
      <RemoveServerButton
        serverName='fs'
        isDisabled={false}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByRole('button', {name: 'Remove'}));
    fireEvent.click(screen.getByRole('button', {name: 'Cancel'}));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
