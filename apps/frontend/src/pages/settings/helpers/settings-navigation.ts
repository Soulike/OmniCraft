export interface SettingsNavLeafItem {
  readonly id: string;
  readonly label: string;
  readonly path: string;
}

export interface SettingsNavGroupItem {
  readonly id: string;
  readonly label: string;
  readonly children: readonly SettingsNavItem[];
}

export type SettingsNavItem = SettingsNavGroupItem | SettingsNavLeafItem;

export const DEFAULT_SETTINGS_ITEM_ID = 'llm.chat';

export function getSelectedSettingsItemId(
  pathname: string,
  items: readonly SettingsNavItem[],
  fallbackItemId = DEFAULT_SETTINGS_ITEM_ID,
): string {
  return findItemByPath(pathname, items)?.id ?? fallbackItemId;
}

export function getSettingsPathByItemId(
  itemId: string,
  items: readonly SettingsNavItem[],
): string | undefined {
  for (const item of items) {
    if ('path' in item && item.id === itemId) {
      return item.path;
    }

    if ('children' in item) {
      const childPath = getSettingsPathByItemId(itemId, item.children);
      if (childPath !== undefined) {
        return childPath;
      }
    }
  }

  return undefined;
}

export function getExpandedSettingsGroupIds(
  selectedItemId: string,
  items: readonly SettingsNavItem[],
): string[] {
  const ancestors: string[] = [];
  return findAncestorGroupIds(selectedItemId, items, ancestors)
    ? ancestors
    : [];
}

function findItemByPath(
  pathname: string,
  items: readonly SettingsNavItem[],
): SettingsNavLeafItem | undefined {
  for (const item of items) {
    if ('path' in item && item.path === pathname) {
      return item;
    }

    if ('children' in item) {
      const childItem = findItemByPath(pathname, item.children);
      if (childItem !== undefined) {
        return childItem;
      }
    }
  }

  return undefined;
}

function findAncestorGroupIds(
  selectedItemId: string,
  items: readonly SettingsNavItem[],
  ancestors: string[],
): boolean {
  for (const item of items) {
    if ('path' in item && item.id === selectedItemId) {
      return true;
    }

    if ('children' in item) {
      ancestors.push(item.id);
      if (findAncestorGroupIds(selectedItemId, item.children, ancestors)) {
        return true;
      }
      ancestors.pop();
    }
  }

  return false;
}
