import type {FC, RefObject, SVGProps} from 'react';
import {Link} from 'react-router';

import OmnicraftDarkIcon from '@/assets/icons/omnicraft-dark.svg?react';
import OmnicraftLightIcon from '@/assets/icons/omnicraft-light.svg?react';
import type {ResolvedTheme} from '@/contexts/theme/index.js';

import {ThemeToggle} from '../ThemeToggle/index.js';
import {NavItemLink} from './components/NavItemLink/index.js';
import type {IndicatorStyle} from './hooks/useActiveIndicator.js';
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
  listRef: RefObject<HTMLElement | null>;
  indicator: IndicatorStyle | null;
}

export function SidebarView({
  primaryItems,
  settingsItem,
  selectedId,
  brandPath,
  theme,
  listRef,
  indicator,
}: SidebarViewProps) {
  const BrandIcon = BRAND_ICONS[theme];

  return (
    <aside className={styles.sidebar} aria-label='Primary'>
      <div className={styles.brandRow}>
        <Link className={styles.brand} to={brandPath}>
          <span className={styles.pedestal}>
            <BrandIcon className={styles.brandIcon} aria-hidden='true' />
          </span>
          <span className={styles.brandName}>OmniCraft</span>
        </Link>
        <div className={styles.themeSlot}>
          <ThemeToggle />
        </div>
      </div>

      <nav className={styles.nav} ref={listRef} aria-label='Primary navigation'>
        <span
          className={styles.indicator}
          style={indicator ?? undefined}
          aria-hidden='true'
        >
          <span key={selectedId} className={styles.sheen} />
        </span>
        {primaryItems.map((item) => (
          <NavItemLink
            key={item.id}
            to={item.path}
            label={item.label}
            Icon={item.Icon}
            active={item.id === selectedId}
          />
        ))}
        <NavItemLink
          to={settingsItem.path}
          label={settingsItem.label}
          Icon={settingsItem.Icon}
          active={settingsItem.id === selectedId}
          className={styles.settingsItem}
        />
      </nav>
    </aside>
  );
}
