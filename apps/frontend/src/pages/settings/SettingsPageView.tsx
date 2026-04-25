import {type ReactNode} from 'react';

import {SettingsNav} from './components/SettingsNav/index.js';
import type {SettingsNavItem} from './helpers/settings-navigation.js';
import styles from './styles.module.css';

interface SettingsPageViewProps {
  readonly navItems: readonly SettingsNavItem[];
  readonly selectedItemId: string;
  readonly expandedGroupIds: ReadonlySet<string>;
  readonly onExpandedGroupIdsChange: (ids: Set<string>) => void;
  readonly onItemSelect: (id: string) => void;
  readonly children: ReactNode;
}

export function SettingsPageView({
  navItems,
  selectedItemId,
  expandedGroupIds,
  onExpandedGroupIdsChange,
  onItemSelect,
  children,
}: SettingsPageViewProps) {
  return (
    <div className={styles.page}>
      <aside className={styles.sidebar}>
        <SettingsNav
          items={navItems}
          selectedItemId={selectedItemId}
          expandedGroupIds={expandedGroupIds}
          onExpandedGroupIdsChange={onExpandedGroupIdsChange}
          onItemSelect={onItemSelect}
        />
      </aside>
      <main className={styles.content}>{children}</main>
    </div>
  );
}
