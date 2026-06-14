# Desktop-App Shell Redesign

**Date:** 2026-06-14
**Status:** Approved

## Goal

Replace the current horizontal top-navbar layout with a desktop-application
style shell: a persistent left navigation rail with the main feature area
rendered as a rounded "inset" panel nested inside the rail's background. The
result should feel like a native desktop app window, not a web page.

## Current State

- `pages/_layout/LayoutView.tsx` — vertical flex column: a sticky top
  `Navbar` over a `<main>` content area.
- `pages/_layout/components/Navbar/` — horizontal bar: brand (left),
  `Tabs` for Dashboard/Chat/Coding/Settings (center), `ThemeToggle` (right).
- `pages/_layout/components/ThemeToggle/` — a 3-button
  `ToggleButtonGroup` (light / dark / system).
- Theme wiring: `useTheme()` → `changeThemeMode(mode)` from
  `contexts/theme`. This wiring is reused unchanged.
- HeroUI v3 (`@heroui/react`), CSS Modules, MVVM structure. Surface/border
  colors come from HeroUI theme variables (`--surface`, `--border`,
  `--surface-shadow`, `--foreground`, `--background`).

## Target Layout

```
┌─────────────────────────────────────────────┐
│ ┌─────────┐  ┌──────────────────────────────┐│
│ │ ◆ Omni  ☾│  │  Dashboard                   ││  <- rounded inset panel
│ │         │  │ ┌──────────┐ ┌──────────┐     ││
│ │ ▣ Dash  │  │ │          │ │          │     ││
│ │ ▢ Chat  │  │ └──────────┘ └──────────┘     ││
│ │ ▢ Coding│  │                              ││
│ │         │  │                              ││
│ │ ─────── │  │                              ││
│ │ ▢ Set...│  │                              ││
│ └─────────┘  └──────────────────────────────┘│
└─────────────────────────────────────────────┘
   left rail        main panel (scrolls inside)
```

- Outer shell: `100dvh`, horizontal flex, no page-level scroll.
- Left rail: fixed width (~230px), shares the page background color.
- Main panel: floating rounded card (`border-radius` ~16px, 1px border,
  inset margin on top/right/bottom). Only the panel interior scrolls.

## Components

### 1. Layout shell — `pages/_layout/`

`LayoutView.tsx` changes from a vertical column to a horizontal flex:
left `Sidebar` + main panel wrapper. `styles.module.css` updated:
`.layout` becomes `flex-direction: row`; a `.panel` wrapper provides the
rounded inset card; `.content` fills the panel and owns the scroll. The
parent (layout) controls placement; the panel wrapper carries the rounding
and border so page views remain layout-agnostic.

### 2. Left rail — `pages/_layout/components/Sidebar/` (new)

Replaces the `Navbar` component entirely. MVVM: `Sidebar.tsx` (connector,
holds nav logic moved from `Navbar.tsx`), `SidebarView.tsx` (stateless),
`styles.module.css`. Three vertical zones in a flex column:

- **Top — branding:** logo mark + "OmniCraft" wordmark, with the theme
  cycle icon button right-aligned on the same row.
- **Middle — primary nav:** Dashboard / Chat / Coding as icon + label
  items. Built on HeroUI `Tabs` with `orientation="vertical"`, using the
  `render` prop on `Tabs.Tab` to emit react-router `Link`s. Active item
  uses the filled indicator/surface treatment.
- **Bottom — Settings:** pinned to the rail foot, separated by a
  `Separator`, same icon+label treatment, part of the same Tabs selection
  model (so route → selected key logic stays unified).

Nav items gain icons (lucide-react). The route/selected-key derivation
(`location.pathname.startsWith(tab.path)`) is preserved from `Navbar.tsx`.

### 3. Theme toggle — `pages/_layout/components/ThemeToggle/`

Reworked from a 3-button group into a single icon button that cycles
`light → dark → system → light`. The icon reflects the current mode
(Sun / Moon / Monitor from lucide-react). `useTheme()` / `changeThemeMode`
wiring is unchanged; only the view and the connector's handler change.

## Removed

- `pages/_layout/components/Navbar/` — deleted. Brand + nav + theme
  responsibilities move into `Sidebar`.

## Unchanged

- All page views (`ChatPageView`, `CodingPageView`, `SettingsPageView`,
  etc.) — they render inside the rounded panel without modification.
- Routes, route definitions, `useTheme` / theme context.
- Nav set stays exactly: Dashboard, Chat, Coding, Settings.

## HeroUI Reuse

- `Tabs` (`orientation="vertical"`, `render` prop for router links) — the
  vertical nav rail.
- `Separator` — divider above the Settings zone.
- `Button` (`isIconOnly`) + `Tooltip` — theme cycle control.
- HeroUI theme variables for all surface/border/shadow colors so light and
  dark modes are handled by the existing token system.

## Testing

- Existing page tests (`ChatPage.test.tsx`, `CodingPage.test.tsx`)
  must continue to pass.
- Manual browser verification in both light and dark themes: rail zones
  positioned correctly (branding top, nav middle, Settings bottom), theme
  icon cycles through all three modes, active nav item reflects the current
  route, and the main panel reads as a rounded inset with only its interior
  scrolling.
