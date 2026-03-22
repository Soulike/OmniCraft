import {Tabs} from '@heroui/react';
import type {FC, SVGProps} from 'react';
import {Link} from 'react-router';

import OmnicraftDarkIcon from '@/assets/icons/omnicraft-dark.svg?react';
import OmnicraftLightIcon from '@/assets/icons/omnicraft-light.svg?react';
import type {ResolvedTheme} from '@/contexts/theme/index.js';

import {ThemeToggle} from '../ThemeToggle/index.js';
import styles from './styles.module.css';
import type {NavTab} from './types.js';

const BRAND_ICONS: Record<ResolvedTheme, FC<SVGProps<SVGSVGElement>>> = {
  light: OmnicraftLightIcon,
  dark: OmnicraftDarkIcon,
};

interface NavbarViewProps {
  tabs: NavTab[];
  selectedTab: string;
  onTabChange: (id: string) => void;
  brandPath: string;
  theme: ResolvedTheme;
}

export function NavbarView({
  tabs,
  selectedTab,
  onTabChange,
  brandPath,
  theme,
}: NavbarViewProps) {
  const BrandIcon = BRAND_ICONS[theme];

  return (
    <nav className={styles.navbar}>
      <div className={styles.left}>
        <Link className={styles.brand} to={brandPath}>
          <BrandIcon className={styles.brandIcon} aria-hidden='true' />
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
