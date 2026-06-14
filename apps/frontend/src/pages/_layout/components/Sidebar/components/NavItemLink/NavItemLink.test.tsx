import {cleanup, render, screen} from '@testing-library/react';
import {MessageSquare} from 'lucide-react';
import {MemoryRouter} from 'react-router';
import {afterEach, describe, expect, it} from 'vitest';

import {NavItemLink} from './NavItemLink.js';

function renderLink(active: boolean, animate?: boolean) {
  return render(
    <MemoryRouter>
      <NavItemLink
        to='/chat'
        label='Chat'
        Icon={MessageSquare}
        active={active}
        animate={animate}
      />
    </MemoryRouter>,
  );
}

describe('NavItemLink', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders a link to its path with its label', () => {
    renderLink(false);
    const link = screen.getByRole('link', {name: 'Chat'});
    expect(link).toHaveAttribute('href', '/chat');
    expect(link).toHaveAttribute('data-active', 'false');
    expect(link).not.toHaveAttribute('aria-current');
  });

  it('marks the active link with aria-current and data-active', () => {
    renderLink(true);
    const link = screen.getByRole('link', {name: 'Chat'});
    expect(link).toHaveAttribute('data-active', 'true');
    expect(link).toHaveAttribute('aria-current', 'page');
  });

  it('does not animate by default (no motion on initial render)', () => {
    renderLink(true);
    expect(screen.getByRole('link', {name: 'Chat'})).toHaveAttribute(
      'data-animate',
      'false',
    );
  });

  it('animates only when explicitly told to (navigation-driven)', () => {
    renderLink(true, true);
    expect(screen.getByRole('link', {name: 'Chat'})).toHaveAttribute(
      'data-animate',
      'true',
    );
  });
});
