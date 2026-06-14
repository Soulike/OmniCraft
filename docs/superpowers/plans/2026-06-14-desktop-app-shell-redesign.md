# Desktop-App Shell Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the horizontal top-navbar layout with a desktop-app shell: a persistent left navigation rail (branding + theme icon top, vertical nav middle, Settings bottom) wrapping a rounded inset main panel.

**Architecture:** A new `Sidebar` component (vertical HeroUI `Tabs` + branding + cycling theme icon) replaces the deleted `Navbar`. `LayoutView` becomes a horizontal flex: rail + rounded panel wrapper that owns the scroll. `ThemeToggle` is reworked from a 3-button group into one cycling icon button. All theme wiring (`useTheme`/`changeThemeMode`) and routes are unchanged.

**Tech Stack:** React 19, react-router 7, HeroUI v3 (`@heroui/react`), CSS Modules, lucide-react icons, Vitest + Testing Library.

---

## File Structure

- `apps/frontend/src/pages/_layout/components/ThemeToggle/` — reworked to a single cycling icon button. New helper `getNextThemeMode.ts` (pure, tested).
- `apps/frontend/src/pages/_layout/components/Sidebar/` — **new**. `Sidebar.tsx` (connector, nav logic), `SidebarView.tsx` (stateless view), `types.ts`, `styles.module.css`, `index.ts`.
- `apps/frontend/src/pages/_layout/LayoutView.tsx` + `styles.module.css` — reworked to horizontal shell with rounded inset panel.
- `apps/frontend/src/pages/_layout/components/Navbar/` — **deleted**.

All commands run from `apps/frontend/`. Package manager is **bun**.

---

## Task 1: Add the theme-cycle helper

**Files:**

- Create: `apps/frontend/src/pages/_layout/components/ThemeToggle/getNextThemeMode.ts`
- Test: `apps/frontend/src/pages/_layout/components/ThemeToggle/getNextThemeMode.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import {describe, expect, it} from 'vitest';

import {getNextThemeMode} from './getNextThemeMode.js';

describe('getNextThemeMode', () => {
  it('cycles light to dark', () => {
    expect(getNextThemeMode('light')).toBe('dark');
  });

  it('cycles dark to system', () => {
    expect(getNextThemeMode('dark')).toBe('system');
  });

  it('cycles system back to light', () => {
    expect(getNextThemeMode('system')).toBe('light');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- getNextThemeMode`
Expected: FAIL — cannot find module `./getNextThemeMode.js`.

- [ ] **Step 3: Write minimal implementation**

```typescript
import type {ThemeMode} from '@/contexts/theme/index.js';

const ORDER: ThemeMode[] = ['light', 'dark', 'system'];

export function getNextThemeMode(current: ThemeMode): ThemeMode {
  const index = ORDER.indexOf(current);
  return ORDER[(index + 1) % ORDER.length];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- getNextThemeMode`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/_layout/components/ThemeToggle/getNextThemeMode.ts apps/frontend/src/pages/_layout/components/ThemeToggle/getNextThemeMode.test.ts
git commit -m "feat(frontend): add theme-cycle helper"
```

---

## Task 2: Rework ThemeToggle into a single cycling icon button

**Files:**

- Modify: `apps/frontend/src/pages/_layout/components/ThemeToggle/ThemeToggleView.tsx`
- Modify: `apps/frontend/src/pages/_layout/components/ThemeToggle/ThemeToggle.tsx`

- [ ] **Step 1: Replace the view with a single cycling icon button**

Overwrite `ThemeToggleView.tsx`:

```tsx
import {Button, Tooltip} from '@heroui/react';
import {Monitor, Moon, Sun} from 'lucide-react';
import type {FC, SVGProps} from 'react';

import type {ThemeMode} from '@/contexts/theme/index.js';

const MODE_ICONS: Record<ThemeMode, FC<SVGProps<SVGSVGElement>>> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

const MODE_LABELS: Record<ThemeMode, string> = {
  light: 'Light theme',
  dark: 'Dark theme',
  system: 'System theme',
};

interface ThemeToggleViewProps {
  themeMode: ThemeMode;
  onCycle: () => void;
}

export function ThemeToggleView({themeMode, onCycle}: ThemeToggleViewProps) {
  const Icon = MODE_ICONS[themeMode];
  const label = `${MODE_LABELS[themeMode]} (click to switch)`;

  return (
    <Tooltip delay={0}>
      <Tooltip.Trigger>
        <Button
          isIconOnly
          size='sm'
          variant='ghost'
          aria-label={label}
          onPress={onCycle}
        >
          <Icon size={18} />
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content>
        <p>{label}</p>
      </Tooltip.Content>
    </Tooltip>
  );
}
```

- [ ] **Step 2: Update the connector to cycle**

Overwrite `ThemeToggle.tsx`:

```tsx
import {useTheme} from '@/hooks/useTheme.js';

import {getNextThemeMode} from './getNextThemeMode.js';
import {ThemeToggleView} from './ThemeToggleView.js';

export function ThemeToggle() {
  const {themeMode, changeThemeMode} = useTheme();

  return (
    <ThemeToggleView
      themeMode={themeMode}
      onCycle={() => {
        changeThemeMode(getNextThemeMode(themeMode));
      }}
    />
  );
}
```

- [ ] **Step 3: Verify it compiles**

Run: `bun run build`
Expected: PASS (no type errors). NOTE: `ThemeToggle` is still imported by `Navbar` at this point; that import stays valid because the export name is unchanged. The unused-old-props are gone.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/pages/_layout/components/ThemeToggle/
git commit -m "feat(frontend): make theme toggle a single cycling icon button"
```

---

## Task 3: Create the Sidebar component

**Files:**

- Create: `apps/frontend/src/pages/_layout/components/Sidebar/types.ts`
- Create: `apps/frontend/src/pages/_layout/components/Sidebar/SidebarView.tsx`
- Create: `apps/frontend/src/pages/_layout/components/Sidebar/styles.module.css`
- Create: `apps/frontend/src/pages/_layout/components/Sidebar/Sidebar.tsx`
- Create: `apps/frontend/src/pages/_layout/components/Sidebar/index.ts`

- [ ] **Step 1: Define nav item types**

`types.ts`:

```typescript
import type {FC, SVGProps} from 'react';

export interface NavItem {
  id: string;
  label: string;
  path: string;
  Icon: FC<SVGProps<SVGSVGElement>>;
}
```

- [ ] **Step 2: Write the styles**

`styles.module.css`. The rail is a flex column; the nav `Tabs.List` is vertical; the Settings tab is pushed to the bottom with `margin-top: auto` and gets a top border to read as a divider.

```css
.sidebar {
  width: 230px;
  height: 100%;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  padding: 16px 12px;
  color: var(--foreground);
}

.brandRow {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px 18px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--foreground);
  text-decoration: none;
  font-size: 17px;
  font-weight: 300;
  user-select: none;
  min-width: 0;
}

.brandIcon {
  width: 30px;
  height: 30px;
  flex-shrink: 0;
}

.brandName {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.themeSlot {
  margin-left: auto;
  flex-shrink: 0;
}

.nav {
  flex: 1;
  min-height: 0;
}

.navList {
  display: flex;
  flex-direction: column;
  gap: 4px;
  height: 100%;
}

.navTab {
  display: flex;
  align-items: center;
  gap: 11px;
  width: 100%;
}

.settingsTab {
  margin-top: auto;
  border-top: 1px solid var(--border);
  padding-top: 14px;
  margin-top: auto;
}

.navIcon {
  flex-shrink: 0;
}
```

NOTE: keep a single `margin-top: auto` — remove the duplicate line if your editor flags it. The duplicate is shown only to make the intent obvious; the property must appear once.

- [ ] **Step 3: Write the stateless view**

`SidebarView.tsx`. Vertical `Tabs`, each `Tabs.Tab` uses the `render` prop to emit a react-router `Link`. Branding + theme icon live in the top row above the Tabs. The Settings item is the last tab and carries the `settingsTab` class.

```tsx
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
    <aside className={styles.sidebar}>
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
                render={(domProps) => <Link {...domProps} to={item.path} />}
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
              render={(domProps) => (
                <Link {...domProps} to={settingsItem.path} />
              )}
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
```

NOTE: `render={(domProps) => <Link {...domProps} to={item.path} />}` — `domProps` is typed loosely by HeroUI; if TypeScript complains about the `href` prop overlap, type the param as `domProps: object` and spread it, keeping `to` explicit. Do not introduce `any`; use `Record<string, unknown>` if a cast is unavoidable.

- [ ] **Step 4: Write the connector**

`Sidebar.tsx`. Carries the route → selected-id logic moved from the old `Navbar.tsx`. Navigation happens via the `Link`s in the view, so no `useNavigate` is needed.

```tsx
import {Code2, LayoutDashboard, MessageSquare, Settings} from 'lucide-react';
import {useMemo} from 'react';
import {useLocation} from 'react-router';

import {useTheme} from '@/hooks/useTheme.js';
import {ROUTES} from '@/routes.js';

import {SidebarView} from './SidebarView.js';
import type {NavItem} from './types.js';

export function Sidebar() {
  const location = useLocation();
  const {resolvedTheme} = useTheme();

  const primaryItems: NavItem[] = useMemo(
    () => [
      {
        id: 'dashboard',
        label: 'Dashboard',
        path: ROUTES.dashboard(),
        Icon: LayoutDashboard,
      },
      {id: 'chat', label: 'Chat', path: ROUTES.chat(), Icon: MessageSquare},
      {id: 'coding', label: 'Coding', path: ROUTES.coding(), Icon: Code2},
    ],
    [],
  );
  const settingsItem: NavItem = useMemo(
    () => ({
      id: 'settings',
      label: 'Settings',
      path: ROUTES.settings(),
      Icon: Settings,
    }),
    [],
  );

  const allItems = useMemo(
    () => [...primaryItems, settingsItem],
    [primaryItems, settingsItem],
  );
  const selectedId = useMemo(
    () =>
      allItems.find((item) => location.pathname.startsWith(item.path))?.id ??
      allItems[0].id,
    [allItems, location.pathname],
  );

  return (
    <SidebarView
      primaryItems={primaryItems}
      settingsItem={settingsItem}
      selectedId={selectedId}
      brandPath={ROUTES.dashboard()}
      theme={resolvedTheme}
    />
  );
}
```

- [ ] **Step 5: Write the index**

`index.ts`:

```typescript
export {Sidebar} from './Sidebar.js';
```

- [ ] **Step 6: Verify it compiles**

Run: `bun run build`
Expected: PASS. If the `render` prop types complain, apply the NOTE in Step 3.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/pages/_layout/components/Sidebar/
git commit -m "feat(frontend): add vertical navigation sidebar"
```

---

## Task 4: Rewire the layout shell and delete Navbar

**Files:**

- Modify: `apps/frontend/src/pages/_layout/LayoutView.tsx`
- Modify: `apps/frontend/src/pages/_layout/styles.module.css`
- Delete: `apps/frontend/src/pages/_layout/components/Navbar/` (whole folder)

- [ ] **Step 1: Rework the layout view**

Overwrite `LayoutView.tsx`:

```tsx
import {type ReactNode} from 'react';

import {Sidebar} from './components/Sidebar/index.js';
import styles from './styles.module.css';

interface LayoutViewProps {
  children: ReactNode;
}

export function LayoutView({children}: LayoutViewProps) {
  return (
    <div className={styles.layout}>
      <Sidebar />
      <div className={styles.panel}>
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Rework the layout styles**

Overwrite `styles.module.css`. Horizontal shell; the panel is a rounded inset card with margin on top/right/bottom (none on the left so it hugs the rail); only `.content` scrolls.

```css
.layout {
  height: 100dvh;
  display: flex;
  flex-direction: row;
  background: var(--background);
}

.panel {
  flex: 1;
  min-width: 0;
  margin: 12px 12px 12px 0;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  box-shadow: var(--surface-shadow);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.content {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
```

- [ ] **Step 3: Delete the old Navbar**

Run:

```bash
git rm -r apps/frontend/src/pages/_layout/components/Navbar/
```

Expected: removes `Navbar.tsx`, `NavbarView.tsx`, `types.ts`, `styles.module.css`, `index.ts`.

- [ ] **Step 4: Verify nothing else imports Navbar**

Run: `grep -rn "components/Navbar" apps/frontend/src`
Expected: no output (zero matches).

- [ ] **Step 5: Verify build and tests**

Run: `bun run build && bun run test`
Expected: build PASSES, all tests PASS (existing `ChatPage.test.tsx`, `CodingPage.test.tsx`, plus `getNextThemeMode`).

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/pages/_layout/
git commit -m "feat(frontend): adopt desktop-app shell with left rail and inset panel"
```

---

## Task 5: Manual browser verification

**Files:** none (verification only).

- [ ] **Step 1: Start the dev server**

Run: `bun run dev` (from `apps/frontend/`). Open the printed local URL.

- [ ] **Step 2: Verify the layout in light theme**

Confirm visually:

- Left rail: branding (logo + "OmniCraft") at the top with the theme icon right-aligned on the same row.
- Nav items Dashboard / Chat / Coding in the middle with icons + labels.
- Settings pinned to the bottom of the rail, with a divider line above it.
- Main panel reads as a rounded inset card hugging the rail; the seam between rail and panel background is clean.
- Navigating between Dashboard/Chat/Coding/Settings updates the active (highlighted) nav item.
- Only the panel interior scrolls (e.g., on Chat with many messages); the rail stays fixed.

- [ ] **Step 3: Verify the theme cycle**

Click the theme icon repeatedly. Confirm it cycles Light → Dark → System → Light, the icon updates each time (Sun/Moon/Monitor), and the whole shell (rail + panel) recolors correctly in dark mode (panel border/surface still reads as an inset).

- [ ] **Step 4: Report**

State explicitly whether each check passed. If any visual issue appears (e.g., Settings not pinned, panel not rounded, scroll on the wrong element), fix the relevant `styles.module.css` and re-verify before claiming completion.

---

## Self-Review Notes

- **Spec coverage:** Layout shell (Task 4), Sidebar three zones (Task 3), theme rework B1 (Tasks 1–2), Navbar removal (Task 4), HeroUI reuse — `Tabs` vertical + `render` Link, `Button`+`Tooltip`, theme vars (Tasks 2–4). Divider above Settings is implemented as a `border-top` on the settings tab rather than a standalone `Separator` element, to keep all four items inside one `Tabs.List` selection model (the spec's intent — a unified route→key model — is preserved).
- **Type consistency:** `NavItem` ({id,label,path,Icon}) is defined in Task 3 Step 1 and used consistently in the view and connector. `getNextThemeMode` signature matches its use in Task 2. `ThemeToggleView` props (`themeMode`,`onCycle`) match the connector.
- **Placeholder scan:** none.
