import {Button, Disclosure, DisclosureGroup} from '@heroui/react';

import type {SettingsNavItem} from '../../helpers/settings-navigation.js';
import styles from './styles.module.css';

interface SettingsNavProps {
  readonly items: readonly SettingsNavItem[];
  readonly selectedItemId: string;
  readonly expandedGroupIds: ReadonlySet<string>;
  readonly onExpandedGroupIdsChange: (ids: Set<string>) => void;
  readonly onItemSelect: (id: string) => void;
}

export function SettingsNav({
  items,
  selectedItemId,
  expandedGroupIds,
  onExpandedGroupIdsChange,
  onItemSelect,
}: SettingsNavProps) {
  const renderItem = (item: SettingsNavItem) => {
    if ('children' in item) {
      return (
        <Disclosure key={item.id} id={item.id} className={styles.group}>
          <Disclosure.Heading>
            <Disclosure.Trigger className={styles.groupTrigger}>
              <span className={styles.groupLabel}>{item.label}</span>
              <Disclosure.Indicator className={styles.groupIndicator} />
            </Disclosure.Trigger>
          </Disclosure.Heading>
          <Disclosure.Content>
            <Disclosure.Body className={styles.groupBody}>
              {item.children.map(renderItem)}
            </Disclosure.Body>
          </Disclosure.Content>
        </Disclosure>
      );
    }

    const isSelected = item.id === selectedItemId;
    return (
      <Button
        key={item.id}
        aria-current={isSelected ? 'page' : undefined}
        className={styles.leafButton}
        data-selected={isSelected}
        fullWidth
        size='sm'
        variant={isSelected ? 'secondary' : 'ghost'}
        onPress={() => {
          onItemSelect(item.id);
        }}
      >
        <span className={styles.leafLabel}>{item.label}</span>
      </Button>
    );
  };

  return (
    <nav aria-label='Settings'>
      <DisclosureGroup
        allowsMultipleExpanded
        className={styles.nav}
        expandedKeys={new Set(expandedGroupIds)}
        onExpandedChange={(keys) => {
          onExpandedGroupIdsChange(new Set(Array.from(keys, String)));
        }}
      >
        {items.map(renderItem)}
      </DisclosureGroup>
    </nav>
  );
}
