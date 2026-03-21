import {Tabs} from '@heroui/react';
import {type ReactNode} from 'react';

import styles from './styles.module.css';

export interface SettingsTab {
  id: string;
  label: string;
}

interface SettingsPageViewProps {
  tabs: SettingsTab[];
  selectedTab: string;
  onTabChange: (id: string) => void;
  children: ReactNode;
}

export function SettingsPageView({
  tabs,
  selectedTab,
  onTabChange,
  children,
}: SettingsPageViewProps) {
  return (
    <div className={styles.page}>
      <aside className={styles.sidebar}>
        <Tabs
          variant='secondary'
          orientation='vertical'
          selectedKey={selectedTab}
          onSelectionChange={(key) => {
            onTabChange(String(key));
          }}
        >
          <Tabs.ListContainer>
            <Tabs.List aria-label='Settings sections'>
              {tabs.map((tab) => (
                <Tabs.Tab key={tab.id} id={tab.id}>
                  {tab.label}
                  <Tabs.Indicator />
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </Tabs.ListContainer>
        </Tabs>
      </aside>
      <main className={styles.content}>{children}</main>
    </div>
  );
}
