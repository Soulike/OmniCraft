import {describe, expect, it} from 'vitest';

import {ROUTES} from './routes.js';

describe('settings routes', () => {
  it('nests Coding Agent and Workspaces under /settings/coding', () => {
    expect(ROUTES.settings.coding.agent()).toBe('/settings/coding/agent');
    expect(ROUTES.settings.coding.workspaces()).toBe(
      '/settings/coding/workspaces',
    );
  });
});
