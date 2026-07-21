# OmniCraft Frontend

- Use TypeScript, React and Vite.
- Use Vitest for testing.

---

# UI Validation

- After introducing any UI change, validate it in a real browser. Start the dev server with the `dev` script defined in the root `package.json`, open the app in a browser, and verify the change renders and behaves correctly in both light and dark themes.

---

# React Specific

## File Structure

Each file must contain at most one React component. If you need a helper component, extract it as a subcomponent under `components/`.

All React components follow MVVM structure, take a component named `Calendar` for example:

```text
Calendar/
  | assets/                 // Static assets needed
  | components/             // Subcomponents
  | hooks/                  // Hooks as view models. Each hook manages a single concern.
  | index.ts                // For exporting the component. No TSX should be in this file.
  | Calendar.tsx            // Optional. Connect view models with view. No state should be in this file. States go in hooks. This file only composes hooks and passes their results to the view.
  | CalendarView.tsx        // Stateless view component. Get all information with props.
  | styles.module.css       // Part of view
```

## Hooks

- One hook, one concern. Each hook is a view model for a single responsibility (e.g. data loading, grouping, expansion state).
- Do NOT write a "super hook" that bundles a component's whole logic (its state + data fetching + handlers). Split it into focused hooks instead.
- The container (`Component.tsx`) is the composition point: it combines several domain hooks and wires their results to the view. It holds no state of its own.

## Component Exporting

We don't use default export, since it makes renaming difficult.

If the component is not for a page, use

```typescript
export {Component} from './container.js';
```

If the component is for a page, use a plain named export. Lazy loading is handled centrally in `router/lazy-pages.tsx`.

```typescript
export {Component} from './Component.js';
```

## Component Importing

### Import Entry

Always import the `index.ts` inside the component folder. `index.ts` should be the only file imported by other
components.

```typescript
// ❌ Not Good, as it accesses an internal file, and prevents lazy loading.
import {Component} from 'path/to/Component/container.js';

// ✅ Good.
import {Component} from 'path/to/Component/index.js';
```

### Import Path

- If you are importing a public module, for example, shared modules in `@/hooks`, `@/components`, use import alias.
- If you are importing a component-internal module, for example, subcomponents, use relative imports.

## Styling

- Use CSS Modules (`styles.module.css`) for all custom component styles.
- Do NOT use Tailwind utility classes in our own components. Tailwind is only present as a dependency for HeroUI.
- HeroUI (`@heroui/react`) is the UI component library. Use its components directly (e.g., `<Spinner />`, `<Button />`).

## Design Language

- Component styling flows from a **single source**: HeroUI's theme tokens.
  Global HeroUI token customization lives only in `src/heroui-overrides.css`.
  Do NOT redefine HeroUI tokens, reach into HeroUI internals (`:global(...)`),
  or paint bespoke material in component CSS Modules — consume HeroUI tokens
  (`var(--surface)`, `var(--border)`, `var(--accent-soft)`, …) instead.
- The app frame (`pages/_layout`) is the only component allowed to carry
  bespoke material (background gradient + Mica backdrop-blur), and it holds it
  as component-internal CSS, not as shared tokens.
- Motion stays event-driven, never ambient; honor `prefers-reduced-motion`.
- Light and dark are both first-class — verify every change in both.

## Directory Structure

- `components/` - Generic, business-agnostic UI components (e.g., `CollapsibleSidebar`, `MarkdownRenderer`).
- `modules/` - Domain-specific modules shared across multiple pages. Unlike `components/`, modules contain feature-specific logic, hooks, contexts, and components that belong to a particular business domain but are used by more than one page.
- `pages/` - Route entry points. Each page is a thin shell that composes modules.

## Layout

- A component must NOT dictate how it is laid out by its parent. Properties like `flex`, `margin`, `grid-column`, `align-self`, etc. that affect the component's placement in the parent's layout must NOT appear in the component's own styles.
- The parent component is responsible for controlling children's layout. Wrap children in a dedicated element (e.g., `<div className={styles.someWrapper}>`) and apply layout properties there.
