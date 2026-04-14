# Tool Parameter Display in ToolExecutionCard

## Summary

Replace the raw JSON "Arguments" section in `ToolExecutionCardView` with structured, per-tool parameter displays parsed from the shared schemas in `@omnicraft/tool-schemas`.

## Current State

The Arguments section in `ToolExecutionCardView` (lines 61-65) renders a `HighlightedJson` component for every tool — showing the full raw JSON blob of tool arguments. The only tool that currently parses arguments is `WriteFileResult`, which extracts the `content` field inside the result section (not the arguments section).

## Design

### Where the Change Happens

The Arguments section in `ToolExecutionCardView` currently renders:

```tsx
<div className={styles.section}>
  <span className={styles.label}>Arguments</span>
  <ScrollShadow className={styles.pre}>
    <HighlightedJson jsonString={toolArguments} />
  </ScrollShadow>
</div>
```

This will be replaced with a new `ParametersSection` component that:

1. Accepts `toolName` and `toolArguments` (the JSON string)
2. Parses the JSON and validates against the tool's parameter schema using `safeParse`
3. Renders structured key-value pairs on success
4. Falls back to `HighlightedJson` on parse failure

### Component Structure

```
ParametersSection/
  index.ts
  ParametersSection.tsx          # Container: parses JSON, dispatches to per-tool view
  ParametersSectionView.tsx      # Fallback view (HighlightedJson wrapper)
  helpers/
    renderToolParameters.tsx     # Switch on toolName, return per-tool component
  components/
    ParameterRow/                # Reusable label + value row
      index.ts
      ParameterRowView.tsx
      styles.module.css
    ReadFileParameters/
      index.ts
      ReadFileParametersView.tsx
      styles.module.css
    WriteFileParameters/
      ...
    EditFileParameters/
      ...
    FindFilesParameters/
      ...
    SearchFilesParameters/
      ...
    RunCommandParameters/
      ...
    WebSearchParameters/
      ...
    WebFetchParameters/
      ...
    WebFetchRawParameters/
      ...
    LoadSkillParameters/
      ...
```

### Per-Tool Parameter Display

Each tool gets a stateless view component showing its parsed fields as compact key-value rows.

#### read_file

| Label | Value                                   | Notes                                    |
| ----- | --------------------------------------- | ---------------------------------------- |
| File  | `filePath` in monospace                 | Always shown                             |
| Lines | `startLine`–`startLine + lineCount - 1` | Only when startLine or lineCount present |

#### write_file

| Label   | Value                                     | Notes                                                                             |
| ------- | ----------------------------------------- | --------------------------------------------------------------------------------- |
| File    | `filePath` in monospace                   | Always shown                                                                      |
| Content | _(shown in result below)_ in muted italic | Always shown; content itself is rendered by WriteFileResult in the result section |

#### edit_file

| Label       | Value                                             | Notes                                   |
| ----------- | ------------------------------------------------- | --------------------------------------- |
| File        | `filePath` in monospace                           | Always shown                            |
| Old         | `oldString` in monospace, red-tinted background   | Always shown                            |
| New         | `newString` in monospace, green-tinted background | Always shown                            |
| Replace all | "Yes" or "No"                                     | Only shown when `replaceAll` is present |

#### find_files

| Label   | Value                                | Notes             |
| ------- | ------------------------------------ | ----------------- |
| Pattern | `pattern` in monospace, accent color | Always shown      |
| Path    | `path` in monospace                  | Only when present |

#### search_files

| Label       | Value                                | Notes             |
| ----------- | ------------------------------------ | ----------------- |
| Pattern     | `pattern` in monospace, accent color | Always shown      |
| Path        | `path` in monospace                  | Only when present |
| File filter | `filePattern` in monospace           | Only when present |

#### run_command

| Label   | Value                                               | Notes             |
| ------- | --------------------------------------------------- | ----------------- |
| Command | `$ {command}` in monospace, subtle background block | Always shown      |
| Timeout | `{timeout / 1000}s`                                 | Only when present |

#### web_search

| Label       | Value                             | Notes             |
| ----------- | --------------------------------- | ----------------- |
| Query       | `query` as plain text             | Always shown      |
| Max results | `maxResults` as number            | Only when present |
| Domains     | `includeDomains` joined with ", " | Only when present |
| Exclude     | `excludeDomains` joined with ", " | Only when present |

#### web_fetch

| Label     | Value                                | Notes                                  |
| --------- | ------------------------------------ | -------------------------------------- |
| URL       | `url` as a clickable link, monospace | Always shown                           |
| Full page | "Yes" or "No"                        | Only when `includeFullPage` is present |

#### web_fetch_raw

| Label | Value                                | Notes        |
| ----- | ------------------------------------ | ------------ |
| URL   | `url` as a clickable link, monospace | Always shown |

#### load_skill

| Label | Value                | Notes        |
| ----- | -------------------- | ------------ |
| Skill | `name` as plain text | Always shown |

### Visual Style

- **Labels**: reuse the existing `.label` style — `0.75rem`, `font-weight: 600`, `color: var(--muted)`, `text-transform: uppercase`, `letter-spacing: 0.05em`
- **Layout**: vertical stack of rows, each row is a horizontal flex with label (fixed min-width) and value
- **Monospace**: file paths, patterns, commands, URLs use `font-family: monospace`
- **edit_file old/new**: red-tinted background (`rgba(danger, 0.1)`) for old, green-tinted (`rgba(success, 0.1)`) for new
- **run_command**: command value gets a subtle `var(--background)` block with `$` prefix
- **URLs**: styled as links with `color: var(--accent)`, no underline
- **Patterns**: accent color to visually distinguish from plain paths

### ParameterRow Component

A shared `ParameterRow` component handles the label + value layout:

```tsx
interface ParameterRowViewProps {
  label: string;
  children: ReactNode;
}
```

This keeps label width, spacing, and typography consistent across all tools without duplicating styles.

### Fallback Behavior

If `JSON.parse` or `safeParse` fails for any tool, the section falls back to showing `HighlightedJson` — identical to the current behavior. A `console.warn` is logged for debugging, matching the pattern in `WriteFileResult`.

### Integration with ToolExecutionCardView

The existing Arguments section label ("Arguments") will be renamed to "Parameters" to match the semantic meaning. The section structure stays the same — only the content changes from `HighlightedJson` to `ParametersSection`.

## Files to Create

- `ParametersSection/index.ts`
- `ParametersSection/ParametersSection.tsx`
- `ParametersSection/ParametersSectionView.tsx`
- `ParametersSection/styles.module.css`
- `ParametersSection/helpers/renderToolParameters.tsx`
- `ParametersSection/components/ParameterRow/index.ts`
- `ParametersSection/components/ParameterRow/ParameterRowView.tsx`
- `ParametersSection/components/ParameterRow/styles.module.css`
- One `*ParametersView.tsx` + `styles.module.css` + `index.ts` per tool (10 tools)

## Files to Modify

- `ToolExecutionCardView.tsx` — replace HighlightedJson arguments section with ParametersSection
