import {Tabs} from '@heroui/react';

import {ThemeToggle} from '../ThemeToggle/index.js';
import styles from './styles.module.css';
import type {NavTab} from './types.js';

interface NavbarViewProps {
  tabs: NavTab[];
  selectedTab: string;
  onTabChange: (id: string) => void;
  onBrandClick: () => void;
}

export function NavbarView({
  tabs,
  selectedTab,
  onTabChange,
  onBrandClick,
}: NavbarViewProps) {
  return (
    <nav className={styles.navbar}>
      <a className={styles.brand} onClick={onBrandClick}>
        OmniCraft
      </a>
      <div className={styles.tabs}>
        <Tabs
          selectedKey={selectedTab}
          onSelectionChange={(key) => {
            onTabChange(String(key));
          }}
        >
          <Tabs.ListContainer>
            <Tabs.List aria-label='Navigation'>
              {tabs.map((tab) => (
                <Tabs.Tab key={tab.id} id={tab.id}>
                  {tab.label}
                  <Tabs.Indicator />
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </Tabs.ListContainer>
        </Tabs>
      </div>
      <div className={styles.right}>
        <ThemeToggle />
      </div>
    </nav>
  );
}
