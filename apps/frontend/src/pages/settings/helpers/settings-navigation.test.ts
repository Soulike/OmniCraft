import {describe, expect, it} from 'vitest';

import {
  getExpandedSettingsGroupIds,
  getSelectedSettingsItemId,
  getSettingsPathByItemId,
  type SettingsNavItem,
} from './settings-navigation.js';

const TEST_NAV_ITEMS: readonly SettingsNavItem[] = [
  {
    id: 'llm',
    label: 'LLM',
    children: [
      {id: 'llm.chat', label: 'Chat Agent', path: '/settings/llm/chat'},
      {id: 'llm.coding', label: 'Coding Agent', path: '/settings/llm/coding'},
    ],
  },
  {
    id: 'file-access',
    label: 'File Access',
    children: [
      {
        id: 'file-access.workspaces',
        label: 'Workspaces',
        path: '/settings/file-access/workspaces',
      },
    ],
  },
  {
    id: 'tools',
    label: 'Tools',
    children: [
      {id: 'tools.search', label: 'Search', path: '/settings/tools/search'},
    ],
  },
];

describe('settings navigation', () => {
  it('maps nested settings paths to leaf item ids', () => {
    expect(
      getSelectedSettingsItemId('/settings/llm/coding', TEST_NAV_ITEMS),
    ).toBe('llm.coding');
    expect(
      getSelectedSettingsItemId(
        '/settings/file-access/workspaces',
        TEST_NAV_ITEMS,
      ),
    ).toBe('file-access.workspaces');
  });

  it('returns the fallback item id for unknown paths', () => {
    expect(getSelectedSettingsItemId('/settings/unknown', TEST_NAV_ITEMS)).toBe(
      'llm.chat',
    );
  });

  it('maps leaf item ids to paths', () => {
    expect(getSettingsPathByItemId('tools.search', TEST_NAV_ITEMS)).toBe(
      '/settings/tools/search',
    );
  });

  it('expands the ancestor group for the selected leaf item', () => {
    expect(
      getExpandedSettingsGroupIds('file-access.workspaces', TEST_NAV_ITEMS),
    ).toEqual(['file-access']);
  });
});
