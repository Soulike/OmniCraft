# OmniCraft Frontend

- Use TypeScript, React and Vite.
- Use Vitest for testing.

---

# React Specific

## File Structure

All React components follow MVVM structure, take a component named `Calendar` for example:

```text
Calendar/
  | assets/                 // Static assets needed
  | components/             // Subcomponents
  | hooks/                  // Hooks as view models.
  | index.ts                // For exporting the component. No TSX should be in this file.
  | Calendar.tsx            // Optional. Connect view models with view.
  | CalendarView.tsx        // Stateless view component. Get all information with props.
  | styles.module.css       // Part of view
```

## Component Exporting

We don't use default export, since it makes renaming difficult.

If the component is not for a page, use

```typescript
export {Component} from './container.js';
```

If the component is for a page, consider using `React.lazy()` to export it for better code-splitting.

```typescript
export const Component = React.lazy(async () => {
  const {Component} = await import('./container.js');
  return {default: Component};
});
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
