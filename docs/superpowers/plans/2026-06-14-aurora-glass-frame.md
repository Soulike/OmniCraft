# Aurora Glass Frame Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin the OmniCraft app frame (left nav rail + main panel) into the "Aurora Glass" visual language: self-hosted display fonts, an inset/seamed main panel, and a hand-rolled glass nav rail with a traveling active indicator and one-shot click feedback — all theme-aware (light & dark) and motion-restrained.

**Architecture:** The structural skeleton (rail zones, routes, theme wiring) already exists. This plan replaces the HeroUI `Tabs`-based nav with a hand-rolled nav list (router `Link`s) carrying glass styling and a single absolutely-positioned indicator that slides between items via CSS transition. Geometry is measured by a small hook (`useActiveIndicator`). Visual values come from `--aurora-*` CSS tokens in `src/aurora-glass.css`. The main panel becomes a recessed (inset) surface seamed flush into the rail.

**Tech Stack:** React 19, react-router 7, HeroUI v3 (`@heroui/react`) for Tooltip/Button/theme tokens, CSS Modules, lucide-react icons, Fontsource (self-hosted variable fonts), Vitest + Testing Library, **bun** as package manager.

**Design source of truth:** `apps/frontend/docs/design-language.md` and `docs/superpowers/specs/2026-06-14-aurora-glass-frame-design.md`. Read both before starting. Non-negotiable rules: motion is event-driven only (never ambient/looping) and must respect `prefers-reduced-motion`; light & dark are both first-class; consume `--aurora-*` / HeroUI tokens via `var(--…)` — never hard-code brand values; CSS Modules only (no Tailwind classes in our components); MVVM (views stateless, hooks hold state); no `any`.

**Self-verification:** Run the dev server from the **repo root** with `bun dev` (serves the frontend on `http://localhost:5173`). `/api/*` 502s are expected when the backend isn't running and are unrelated to frame visuals.

---

## File Structure

- `apps/frontend/package.json` — add Fontsource font deps (via `bun add`).
- `apps/frontend/src/main.tsx` — import the font CSS.
- `apps/frontend/src/index.css` — apply `var(--font-ui)` to `body`.
- `apps/frontend/src/aurora-glass.css` — add new tokens (`--aurora-panel-bg`, `--aurora-sheen`, `--aurora-active-icon-glow`) for both themes.
- `apps/frontend/docs/design-language.md` — keep the §3.2 token table in sync with the new tokens.
- `apps/frontend/src/pages/_layout/styles.module.css` — recessed/inset panel + seam.
- `apps/frontend/src/pages/_layout/components/Sidebar/styles.module.css` — rail aurora background, glass pedestal, nav list, traveling indicator, sheen, settings pin, wordmark font.
- `apps/frontend/src/pages/_layout/components/Sidebar/hooks/useActiveIndicator.ts` (+ test) — **new**. Measures the active item's geometry.
- `apps/frontend/src/pages/_layout/components/Sidebar/components/NavItemLink/` (+ test) — **new**. One presentational nav link (icon + label).
- `apps/frontend/src/pages/_layout/components/Sidebar/SidebarView.tsx` — replace HeroUI `Tabs` with the hand-rolled nav.
- `apps/frontend/src/pages/_layout/components/Sidebar/Sidebar.tsx` — call `useActiveIndicator`, pass geometry down.

All commands run from `apps/frontend/` unless stated otherwise.

---

## Task 1: Self-host the display fonts

**Files:**

- Modify: `apps/frontend/package.json` (via `bun add`)
- Modify: `apps/frontend/src/main.tsx`
- Modify: `apps/frontend/src/index.css`

- [ ] **Step 1: Install the variable fonts**

Run (from `apps/frontend/`):

```bash
bun add @fontsource-variable/bricolage-grotesque @fontsource-variable/sora
```

Expected: both added to `dependencies` in `package.json`. Do not hand-edit the versions.

- [ ] **Step 2: Import the font CSS in `main.tsx`**

The first lines of `apps/frontend/src/main.tsx` are currently:

```tsx
import './index.css';

import {Toast} from '@heroui/react';
```

Change the leading side-effect imports to (fonts first, then app CSS):

```tsx
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/sora';
import './index.css';

import {Toast} from '@heroui/react';
```

- [ ] **Step 3: Apply the UI font to `body`**

`apps/frontend/src/index.css` is currently:

```css
@import 'tailwindcss';
@import '@heroui/styles';
@import './aurora-glass.css';

body {
  min-height: 100dvh;
  background: var(--background);
  color: var(--foreground);
}

#root {
  min-height: 100dvh;
}
```

Add the `font-family` line to `body` (the `--font-ui` token already exists in `aurora-glass.css`):

```css
body {
  min-height: 100dvh;
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-ui);
}
```

- [ ] **Step 4: Verify build + lint**

Run: `bun run build`
Expected: PASS (the font packages resolve, no type errors).
Run: `bun run lint`
Expected: no NEW errors (pre-existing warnings are fine).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/package.json apps/frontend/src/main.tsx apps/frontend/src/index.css
git commit -m "feat(frontend): self-host Bricolage Grotesque + Sora via Fontsource"
```

> Note: a lockfile (`bun.lock`/`bun.lockb`) may also change — include it in the commit if `git status` shows it.

---

## Task 2: Inset frame shell + new Aurora tokens

**Files:**

- Modify: `apps/frontend/src/aurora-glass.css`
- Modify: `apps/frontend/src/pages/_layout/styles.module.css`
- Modify: `apps/frontend/src/pages/_layout/components/Sidebar/styles.module.css`
- Modify: `apps/frontend/docs/design-language.md`

- [ ] **Step 1: Add new tokens to `aurora-glass.css`**

In `apps/frontend/src/aurora-glass.css`, add three tokens to **each** theme block. In the `:root.light` block, add:

```css
--aurora-panel-bg: oklch(0.95 0.002 286);
--aurora-sheen: linear-gradient(
  100deg,
  transparent,
  rgba(120, 140, 220, 0.18),
  transparent
);
--aurora-active-icon-glow: none;
```

In the `:root.dark` block, add:

```css
--aurora-panel-bg: oklch(0.1 0.005 285.82);
--aurora-sheen: linear-gradient(
  100deg,
  transparent,
  rgba(255, 255, 255, 0.22),
  transparent
);
--aurora-active-icon-glow: drop-shadow(0 0 6px rgba(150, 170, 255, 0.8));
```

- [ ] **Step 2: Keep the design-language token table in sync**

In `apps/frontend/docs/design-language.md`, in the §3.2 token table, add these rows (after `--aurora-inset-shadow`):

```markdown
| `--aurora-panel-bg` | Recessed (inset) main-panel surface |
| `--aurora-sheen` | One-shot sheen sweep gradient on active nav item |
| `--aurora-active-icon-glow` | Active nav icon glow filter (dark only; `none` in light) |
```

- [ ] **Step 3: Make the main panel recessed (inset) + seamed**

Replace the entire contents of `apps/frontend/src/pages/_layout/styles.module.css` with:

```css
.layout {
  height: 100dvh;
  display: flex;
  flex-direction: row;
  background: var(--background);
}

.sidebarWrapper {
  flex-shrink: 0;
}

.panel {
  position: relative;
  flex: 1;
  min-width: 0;
  margin: 14px 14px 14px 0;
  background: var(--aurora-panel-bg);
  border: 1px solid var(--border);
  border-left: none;
  border-radius: 0 16px 16px 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* Recessed bezel: an overlay that paints the inner shadow above page
   content so the panel reads as set INTO the rail's plane. */
.panel::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  box-shadow: var(--aurora-inset-shadow);
  pointer-events: none;
  z-index: 2;
}

.content {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
```

- [ ] **Step 4: Give the rail its aurora-glow background**

In `apps/frontend/src/pages/_layout/components/Sidebar/styles.module.css`, replace the `.sidebar` rule (currently just `width/height/display/flex-direction/padding/color`) with:

```css
.sidebar {
  width: 230px;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 16px 12px;
  color: var(--foreground);
  background:
    radial-gradient(
      140% 48% at 50% -12%,
      var(--aurora-glow-accent),
      transparent 60%
    ),
    radial-gradient(
      90% 38% at 100% 104%,
      var(--aurora-glow-violet),
      transparent 58%
    ),
    var(--background);
}
```

Leave the rest of the file unchanged for now (the nav/brand rules are rewritten in Task 5).

- [ ] **Step 5: Verify build**

Run: `bun run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/aurora-glass.css apps/frontend/docs/design-language.md apps/frontend/src/pages/_layout/styles.module.css apps/frontend/src/pages/_layout/components/Sidebar/styles.module.css
git commit -m "feat(frontend): recessed inset panel and aurora rail background"
```

---

## Task 3: `useActiveIndicator` geometry hook

**Files:**

- Create: `apps/frontend/src/pages/_layout/components/Sidebar/hooks/useActiveIndicator.ts`
- Test: `apps/frontend/src/pages/_layout/components/Sidebar/hooks/useActiveIndicator.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/pages/_layout/components/Sidebar/hooks/useActiveIndicator.test.ts`:

```ts
import {renderHook} from '@testing-library/react';
import {beforeAll, describe, expect, it, vi} from 'vitest';

import {useActiveIndicator} from './useActiveIndicator.js';

class ResizeObserverStub implements ResizeObserver {
  disconnect = vi.fn();
  observe = vi.fn();
  unobserve = vi.fn();
}

beforeAll(() => {
  globalThis.ResizeObserver = ResizeObserverStub;
});

describe('useActiveIndicator', () => {
  it('returns a list ref and a null indicator before any element is measured', () => {
    const {result} = renderHook(() => useActiveIndicator('chat'));
    expect(result.current.listRef).toHaveProperty('current');
    expect(result.current.indicator).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- useActiveIndicator`
Expected: FAIL — cannot find module `./useActiveIndicator.js`.

- [ ] **Step 3: Implement the hook**

Create `apps/frontend/src/pages/_layout/components/Sidebar/hooks/useActiveIndicator.ts`:

```ts
import {useCallback, useLayoutEffect, useRef, useState} from 'react';

export interface IndicatorStyle {
  transform: string;
  height: string;
}

/**
 * Measures the geometry of the currently-active nav item (the element
 * carrying `data-active="true"` inside the returned ref) so a single
 * absolutely-positioned indicator can slide to it. Recomputes when the
 * selection changes and when the list resizes.
 */
export function useActiveIndicator(selectedId: string) {
  const listRef = useRef<HTMLElement | null>(null);
  const [indicator, setIndicator] = useState<IndicatorStyle | null>(null);

  const measure = useCallback(() => {
    const list = listRef.current;
    if (!list) {
      return;
    }
    const active = list.querySelector<HTMLElement>('[data-active="true"]');
    if (!active) {
      setIndicator(null);
      return;
    }
    setIndicator({
      transform: `translateY(${active.offsetTop}px)`,
      height: `${active.offsetHeight}px`,
    });
  }, []);

  useLayoutEffect(() => {
    measure();
  }, [measure, selectedId]);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) {
      return;
    }
    const observer = new ResizeObserver(() => {
      measure();
    });
    observer.observe(list);
    return () => {
      observer.disconnect();
    };
  }, [measure]);

  return {listRef, indicator};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- useActiveIndicator`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/_layout/components/Sidebar/hooks/
git commit -m "feat(frontend): add useActiveIndicator geometry hook for nav rail"
```

---

## Task 4: `NavItemLink` presentational component

**Files:**

- Create: `apps/frontend/src/pages/_layout/components/Sidebar/components/NavItemLink/NavItemLink.tsx`
- Create: `apps/frontend/src/pages/_layout/components/Sidebar/components/NavItemLink/styles.module.css`
- Create: `apps/frontend/src/pages/_layout/components/Sidebar/components/NavItemLink/index.ts`
- Test: `apps/frontend/src/pages/_layout/components/Sidebar/components/NavItemLink/NavItemLink.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/pages/_layout/components/Sidebar/components/NavItemLink/NavItemLink.test.tsx`:

```tsx
import {render, screen} from '@testing-library/react';
import {MessageSquare} from 'lucide-react';
import {MemoryRouter} from 'react-router';
import {describe, expect, it} from 'vitest';

import {NavItemLink} from './NavItemLink.js';

function renderLink(active: boolean) {
  return render(
    <MemoryRouter>
      <NavItemLink
        to='/chat'
        label='Chat'
        Icon={MessageSquare}
        active={active}
      />
    </MemoryRouter>,
  );
}

describe('NavItemLink', () => {
  it('renders a link to its path with its label', () => {
    renderLink(false);
    const link = screen.getByRole('link', {name: 'Chat'});
    expect(link).toHaveAttribute('href', '/chat');
    expect(link).toHaveAttribute('data-active', 'false');
    expect(link).not.toHaveAttribute('aria-current');
  });

  it('marks the active link with aria-current and data-active', () => {
    renderLink(true);
    const link = screen.getByRole('link', {name: 'Chat'});
    expect(link).toHaveAttribute('data-active', 'true');
    expect(link).toHaveAttribute('aria-current', 'page');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- NavItemLink`
Expected: FAIL — cannot find module `./NavItemLink.js`.

- [ ] **Step 3: Write the styles**

Create `apps/frontend/src/pages/_layout/components/Sidebar/components/NavItemLink/styles.module.css`:

```css
.item {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 11px;
  height: 46px;
  padding: 0 14px;
  border-radius: 12px;
  font-family: var(--font-ui);
  font-size: 14.5px;
  font-weight: 500;
  letter-spacing: -0.004em;
  color: var(--muted);
  text-decoration: none;
  transition:
    color 0.15s ease,
    background 0.15s ease;
}

.item:hover {
  color: var(--foreground);
  background: color-mix(in oklch, var(--foreground) 6%, transparent);
}

.item[data-active='true'] {
  color: var(--foreground);
}

.icon {
  flex-shrink: 0;
}

.item[data-active='true'] .icon {
  color: var(--accent);
  filter: var(--aurora-active-icon-glow);
  animation: pop 0.4s ease-out;
}

@keyframes pop {
  0% {
    transform: scale(1);
  }
  45% {
    transform: scale(1.18);
  }
  100% {
    transform: scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .item {
    transition: none;
  }
  .item[data-active='true'] .icon {
    animation: none;
  }
}
```

- [ ] **Step 4: Write the component**

Create `apps/frontend/src/pages/_layout/components/Sidebar/components/NavItemLink/NavItemLink.tsx`:

```tsx
import clsx from 'clsx';
import type {LucideIcon} from 'lucide-react';
import {Link} from 'react-router';

import styles from './styles.module.css';

interface NavItemLinkProps {
  to: string;
  label: string;
  Icon: LucideIcon;
  active: boolean;
  className?: string;
}

export function NavItemLink({
  to,
  label,
  Icon,
  active,
  className,
}: NavItemLinkProps) {
  return (
    <Link
      to={to}
      className={clsx(styles.item, className)}
      data-active={active}
      aria-current={active ? 'page' : undefined}
    >
      <Icon className={styles.icon} size={20} aria-hidden='true' />
      {label}
    </Link>
  );
}
```

- [ ] **Step 5: Write the index**

Create `apps/frontend/src/pages/_layout/components/Sidebar/components/NavItemLink/index.ts`:

```ts
export {NavItemLink} from './NavItemLink.js';
```

- [ ] **Step 6: Run test to verify it passes**

Run: `bun run test -- NavItemLink`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/pages/_layout/components/Sidebar/components/NavItemLink/
git commit -m "feat(frontend): add glass NavItemLink component"
```

---

## Task 5: Assemble the hand-rolled nav rail (replace HeroUI Tabs)

**Files:**

- Modify: `apps/frontend/src/pages/_layout/components/Sidebar/SidebarView.tsx`
- Modify: `apps/frontend/src/pages/_layout/components/Sidebar/Sidebar.tsx`
- Modify: `apps/frontend/src/pages/_layout/components/Sidebar/styles.module.css`

- [ ] **Step 1: Rewrite the Sidebar styles**

Replace the entire contents of `apps/frontend/src/pages/_layout/components/Sidebar/styles.module.css` with (keeps the `.sidebar` aurora background from Task 2, adds the glass pedestal, nav list, traveling indicator, sheen, and settings pin):

```css
.sidebar {
  width: 230px;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 16px 12px;
  color: var(--foreground);
  background:
    radial-gradient(
      140% 48% at 50% -12%,
      var(--aurora-glow-accent),
      transparent 60%
    ),
    radial-gradient(
      90% 38% at 100% 104%,
      var(--aurora-glow-violet),
      transparent 58%
    ),
    var(--background);
}

.brandRow {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 6px 20px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 11px;
  color: var(--foreground);
  text-decoration: none;
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.01em;
  user-select: none;
  min-width: 0;
}

.pedestal {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: var(--aurora-glass-fill);
  border: 1px solid var(--aurora-glass-border);
  box-shadow: var(--aurora-glass-highlight);
}

.brandIcon {
  width: 28px;
  height: 28px;
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
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* Single indicator that slides between items. */
.indicator {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 0;
  border-radius: 12px;
  background: var(--aurora-active-fill);
  box-shadow: var(--aurora-glass-highlight);
  pointer-events: none;
  overflow: hidden;
  transition:
    transform 0.28s cubic-bezier(0.5, 1.3, 0.4, 1),
    height 0.28s cubic-bezier(0.5, 1.3, 0.4, 1);
}

.indicator::before {
  content: '';
  position: absolute;
  left: 0;
  top: 9px;
  bottom: 9px;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--aurora-active-bar);
  box-shadow: var(--aurora-active-bar-glow);
}

.sheen {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 45%;
  background: var(--aurora-sheen);
  animation: sheen 0.6s ease-out;
}

@keyframes sheen {
  from {
    left: -50%;
  }
  to {
    left: 120%;
  }
}

.settingsItem {
  margin-top: auto;
}

@media (prefers-reduced-motion: reduce) {
  .indicator {
    transition: none;
  }
  .sheen {
    display: none;
  }
}
```

- [ ] **Step 2: Rewrite `SidebarView.tsx`**

Replace the entire contents of `apps/frontend/src/pages/_layout/components/Sidebar/SidebarView.tsx` with:

```tsx
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
```

- [ ] **Step 3: Wire the hook into the connector**

In `apps/frontend/src/pages/_layout/components/Sidebar/Sidebar.tsx`, add the hook import and call, and pass the two new props. The connector currently ends by returning `<SidebarView … />` with `primaryItems`, `settingsItem`, `selectedId`, `brandPath`, `theme`. Add the import near the other relative imports:

```tsx
import {useActiveIndicator} from './hooks/useActiveIndicator.js';
```

Then, immediately before the `return`, add:

```tsx
const {listRef, indicator} = useActiveIndicator(selectedId);
```

And extend the JSX props:

```tsx
return (
  <SidebarView
    primaryItems={primaryItems}
    settingsItem={settingsItem}
    selectedId={selectedId}
    brandPath={ROUTES.dashboard()}
    theme={resolvedTheme}
    listRef={listRef}
    indicator={indicator}
  />
);
```

- [ ] **Step 4: Verify build + full test suite**

Run: `bun run build`
Expected: PASS — no more `Tabs` import, `IndicatorStyle` and `RefObject` types resolve, no `any`.
Run: `bun run test`
Expected: all tests PASS (existing suite + `useActiveIndicator` + `NavItemLink`).
Run: `bun run lint`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/_layout/components/Sidebar/
git commit -m "feat(frontend): hand-rolled glass nav rail with traveling indicator"
```

---

## Task 6: Browser verification (both themes, all routes)

**Files:** none (verification + visual tuning only).

- [ ] **Step 1: Start the dev server**

From the **repo root**: `bun dev`. Open `http://localhost:5173`.

- [ ] **Step 2: Verify dark theme**

Set dark mode (theme toggle, or `localStorage['theme-mode']='dark'`). Confirm:

- Rail shows the aurora glow from the top; brand sits in a glass pedestal; wordmark is in the display font (Bricolage Grotesque).
- The active nav item has a glass fill + glowing accent left bar; its icon is accent-tinted with a soft glow.
- Settings stays pinned at the bottom.
- The main panel reads as **recessed** into the rail (inner shadow top/left, panel slightly darker, flush-left seam, rounded right corners).

- [ ] **Step 3: Verify the traveling indicator + feedback**

Click between Dashboard / Chat / Coding / Settings. Confirm the active indicator **slides** (with a slight spring) to the new item rather than jumping, a sheen sweeps once on selection, and the new icon pops once. Confirm the resting UI is otherwise completely static (no looping animation anywhere).

- [ ] **Step 4: Verify light theme**

Switch to light. Confirm the same structure reinterpreted: pale frosted pedestal + soft shadows (no glow), pale-blue active fill with a solid accent bar (no icon glow), recessed panel via soft inset shadow. Both themes should feel coherent.

- [ ] **Step 5: Verify reduced motion**

In the OS (or DevTools → Rendering → "Emulate prefers-reduced-motion: reduce"), reload and navigate. Confirm the indicator **snaps** to the new position (no slide), and no sheen/pop plays.

- [ ] **Step 6: Tune if needed, then report**

If any visual is off (e.g. inset shadow too strong over content, indicator misaligned by a few px, seam visible as a hard line), adjust the relevant `--aurora-*` token or the CSS in `_layout/styles.module.css` / `Sidebar/styles.module.css`, and re-verify. Capture screenshots of both themes. State explicitly which checks passed. Commit any tuning:

```bash
git add apps/frontend/src/
git commit -m "fix(frontend): tune Aurora Glass frame visuals"
```

---

## Self-Review Notes

- **Spec coverage:** Aesthetic/glow/noise & both-theme recipe (Tasks 2, 5 + tokens); typography self-hosted Latin + CJK fallback (Task 1, tokens already present); glass pedestal static (Task 5); hand-rolled nav replacing Tabs (Tasks 3–5); active glass state + glowing left bar + icon glow (Tasks 4–5); inset/recessed panel (Task 2); seam = flush-left + no left border + inner shadow (Task 2); motion = traveling indicator + one-shot sheen/pop, reduced-motion respected (Tasks 4–5, verified Task 6); reuse HeroUI Tooltip/Button/tokens, hand-roll only the nav (preserved — ThemeToggle untouched). Noise texture from the spec is intentionally deferred as optional polish (the glow + glass already carry the material); it can be added later as a token-driven background layer if desired — not blocking.
- **Type consistency:** `IndicatorStyle {transform,height}` defined in Task 3, consumed in Task 5. `NavItemLink` props (`to,label,Icon,active,className?`) defined in Task 4, used in Task 5. `NavItem` ({id,label,path,Icon:LucideIcon}) unchanged from the existing code. `listRef` is `RefObject<HTMLElement | null>` in both the hook (Task 3) and the view prop (Task 5).
- **Placeholder scan:** none — every code step has complete content.
- **Token discipline:** all new visual values go through `--aurora-*` tokens in `aurora-glass.css` (Task 2), referenced via `var(…)`; the design-language token table is updated in the same task to stay in sync.
