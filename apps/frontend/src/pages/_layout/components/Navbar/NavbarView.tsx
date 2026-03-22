import {Tabs} from '@heroui/react';
import {Link} from 'react-router';

import {ThemeToggle} from '../ThemeToggle/index.js';
import styles from './styles.module.css';
import type {NavTab} from './types.js';

interface NavbarViewProps {
  tabs: NavTab[];
  selectedTab: string;
  onTabChange: (id: string) => void;
  brandPath: string;
}

export function NavbarView({
  tabs,
  selectedTab,
  onTabChange,
  brandPath,
}: NavbarViewProps) {
  return (
    <nav className={styles.navbar}>
      <div className={styles.left}>
        <Link className={styles.brand} to={brandPath}>
          OmniCraft
        </Link>
      </div>
      <div className={styles.center}>
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
