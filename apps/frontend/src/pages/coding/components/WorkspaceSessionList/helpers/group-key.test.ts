import type {Workspace} from '@omnicraft/settings-schema';
import {describe, expect, it} from 'vitest';

import {
  sessionGroupKey,
  UNGROUPED_KEY,
  workspaceGroupKey,
} from './group-key.js';

const workspaces = [{path: '/a/'}, {path: '/b'}] as readonly Workspace[];

describe('workspaceGroupKey', () => {
  it('normalizes the trailing slash', () => {
    expect(workspaceGroupKey('/a/')).toBe('/a');
    expect(workspaceGroupKey('/a')).toBe('/a');
  });
});

describe('sessionGroupKey', () => {
  it('returns the workspace key when the working dir matches', () => {
    expect(sessionGroupKey('/a', workspaces)).toBe('/a');
    expect(sessionGroupKey('/b/', workspaces)).toBe('/b');
  });

  it('returns UNGROUPED_KEY when no workspace matches', () => {
    expect(sessionGroupKey('/c', workspaces)).toBe(UNGROUPED_KEY);
  });

  it('returns UNGROUPED_KEY when there is no working dir', () => {
    expect(sessionGroupKey(undefined, workspaces)).toBe(UNGROUPED_KEY);
  });
});
