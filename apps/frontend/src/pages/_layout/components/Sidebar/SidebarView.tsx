import {Tabs} from '@heroui/react';
import type {FC, SVGProps} from 'react';
import {Link} from 'react-router';

import OmnicraftDarkIcon from '@/assets/icons/omnicraft-dark.svg?react';
import OmnicraftLightIcon from '@/assets/icons/omnicraft-light.svg?react';
import type {ResolvedTheme} from '@/contexts/theme/index.js';

import {ThemeToggle} from '../ThemeToggle/index.js';
import styles from './styles.module.css';
import type {NavItem} from './types.js';

const BRAND_ICONS: Record<ResolvedTheme, FC<SVGProps<SVGSVGElement>>> = {
  light: OmnicraftLightIcon,
  dark: OmnicraftDarkIcon,
};

interface SidebarViewProps {
  primaryItems: NavItem[];
  settingsItem: NavItem;
  selectedId: string;
  brandPath: string;
  theme: ResolvedTheme;
}

export function SidebarView({
  primaryItems,
  settingsItem,
  selectedId,
  brandPath,
  theme,
}: SidebarViewProps) {
  const BrandIcon = BRAND_ICONS[theme];

  return (
    <aside className={styles.sidebar} aria-label='Primary'>
      <div className={styles.brandRow}>
        <Link className={styles.brand} to={brandPath}>
          <BrandIcon className={styles.brandIcon} aria-hidden='true' />
          <span className={styles.brandName}>OmniCraft</span>
        </Link>
        <div className={styles.themeSlot}>
          <ThemeToggle />
        </div>
      </div>

      <Tabs
        className={styles.nav}
        orientation='vertical'
        selectedKey={selectedId}
      >
        <Tabs.ListContainer>
          <Tabs.List className={styles.navList} aria-label='Navigation'>
            {primaryItems.map((item) => (
              <Tabs.Tab
                key={item.id}
                id={item.id}
                className={styles.navTab}
                href={item.path}
                render={(domProps) => {
                  if (!('href' in domProps)) return <div {...domProps} />;
                  const {href: _href, ...linkProps} = domProps;
                  return <Link {...linkProps} to={item.path} />;
                }}
              >
                <item.Icon className={styles.navIcon} size={17} />
                {item.label}
                <Tabs.Indicator />
              </Tabs.Tab>
            ))}
            <Tabs.Tab
              id={settingsItem.id}
              className={`${styles.navTab} ${styles.settingsTab}`}
              href={settingsItem.path}
              render={(domProps) => {
                if (!('href' in domProps)) return <div {...domProps} />;
                const {href: _href, ...linkProps} = domProps;
                return <Link {...linkProps} to={settingsItem.path} />;
              }}
            >
              <settingsItem.Icon className={styles.navIcon} size={17} />
              {settingsItem.label}
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>
      </Tabs>
    </aside>
  );
}
