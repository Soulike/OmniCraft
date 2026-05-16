# Compact Tool Call UI

## Summary

Restyle the frontend `ToolExecutionCard` so each tool call is collapsed by default and reads as low-weight transcript metadata instead of a full card. Keep the existing disclosure interaction and the existing parameter/result rendering behind expansion.

The approved direction is Option A from the visual mockup: compact inline rows for every status. There is no grouping, side drawer, or new activity model in scope.

## Current State

`ToolExecutionCardView` renders a 600px bordered surface with a prominent header and expanded disclosure body. The closed state already uses `Disclosure`, but the containing card still has high visual weight because it has a solid surface, border, 12px radius, and full chat-card width.

The detail body is useful and should remain available. It already delegates structured argument rendering to `ParametersSection`, structured output rendering to `ResultSection`, and streaming command output through `ToolOutputContext`.

`ask_user` is not part of this change because `RenderItem` routes it to `AskUserCard` instead of `ToolExecutionCard`.

## Goals

- Make ordinary tool calls take less vertical and visual space in chat.
- Keep all tool calls collapsed by default, including `running`, `done`, `failure`, and `error` states.
- Preserve quick inspection of parameters, streaming output, and results through the existing disclosure expansion.
- Keep failures and errors noticeable without auto-expanding them.
- Avoid changes to the SSE protocol, message transform, or tool result data model.

## Non-Goals

- Do not group consecutive tool calls into activity summaries.
- Do not add a side panel, drawer, popover, or separate result inspector.
- Do not redesign `AskUserCard`.
- Do not change how tool execution events are paired in `useMessageList`.

## Design

### Closed Row

The closed state becomes a compact row, approximately 32px tall:

```text
[status icon] [display name] [target summary] [meta] [disclosure indicator]
```

- **Status icon** shows running, done, failure, or error.
- **Display name** is the existing `displayName` carried by the tool execution event, such as `Read File`, `Run Command`, or `Web Search`.
- **Target summary** is the most useful parsed argument for the tool: file path, command, search pattern, URL, query, skill name, or `toolName` fallback.
- **Meta** is short status/result context: `live output` for running tools with streamed output, `running` for running tools without output, `done` for success, `failed` for tool failures, and `error` for execution errors.
- **Disclosure indicator** remains the affordance for opening the detail body.

The row should use the assistant-message width behavior, not a large fixed visual card. Long targets are single-line, ellipsized, and rendered in monospace where they represent paths, commands, patterns, or URLs.

### Status Styling

All statuses remain collapsed by default.

| Status    | Closed-row treatment                                                                   |
| --------- | -------------------------------------------------------------------------------------- |
| `running` | Slight accent tint, spinner, optional `live output` meta when streaming output exists. |
| `done`    | Muted, low-contrast row so completed tools read as metadata.                           |
| `failure` | Warm warning tint and warning icon, still collapsed.                                   |
| `error`   | Danger tint and error icon, still collapsed.                                           |

Failure and error rows should be easier to notice than successful rows, but they should not dominate the transcript or expand automatically.

### Expanded Detail

Expansion keeps the current content model:

1. Tool name.
2. Parameters via `ParametersSection`.
3. Streaming output while the tool is running and no final result exists.
4. Result via `ResultSection`.

The visual shell changes so the detail reads as attached to the compact row instead of as a separate large card. Padding should be tighter than the current `12px` card body, and the inner pre/result surfaces should keep bounded height and scrolling.

### Tool-Owned Pill Content

The compact row should not depend on one central helper that knows how every tool wants to summarize itself. Instead, `ToolExecutionCard` owns the execution shell, and each tool-specific frontend adapter owns the text shown inside the pill.

The shell owns:

1. Status icon and status styling.
2. Disclosure trigger/content behavior.
3. Rendering the existing `displayName` as the row label.
4. Generic execution meta: `live output`, `running`, `done`, `failed`, or `error`.
5. Fallback rendering when a tool adapter cannot parse its arguments.

Each tool adapter owns:

1. The primary target text, such as a file path, command, query, URL, pattern, or skill name.
2. Whether the target should be rendered as code or plain text.
3. Optional tool-specific secondary text if it is compact enough for the row.

Adapters return structured data rather than JSX:

```typescript
interface ToolExecutionPillContent {
  target: string;
  targetKind: 'code' | 'text';
  detail: string | null;
}
```

The shell combines `displayName`, this tool-owned content, and the shell-owned execution meta. For example, a `run_command` adapter returns the command string; the shell renders `Run Command` and still decides whether the row says `running`, `done`, `failed`, or `error`.

Use a small helper structure inside `ToolExecutionCard`, mirroring the existing `ResultSection/helpers/renderToolResult.tsx` pattern:

```text
ToolExecutionCard/
  helpers/
    pill-content/
      get-tool-pill-content.ts
      fallback-tool-pill-content.ts
      types.ts
      adapters/
        read-file.ts
        write-file.ts
        edit-file.ts
        find-files.ts
        search-files.ts
        run-command.ts
        web-search.ts
        web-fetch.ts
        web-fetch-raw.ts
        load-skill.ts
        get-current-time.ts
```

`get-tool-pill-content.ts` is the only public helper entry point. It parses the JSON arguments, switches on `toolName`, and calls the matching adapter. It should stay thin: routing, fallback, and shared error handling only. The adapters contain the per-tool string-formatting rules.

Recommended adapter ownership:

| Tool               | Adapter decides                                 |
| ------------------ | ----------------------------------------------- |
| `read_file`        | File path target and optional line detail.      |
| `write_file`       | File path target.                               |
| `edit_file`        | File path target and optional edit detail.      |
| `find_files`       | Pattern target and optional path detail.        |
| `search_files`     | Pattern target and optional filter/path detail. |
| `run_command`      | Command target and optional timeout detail.     |
| `web_search`       | Query target and optional result-count detail.  |
| `web_fetch`        | URL target and optional full-page detail.       |
| `web_fetch_raw`    | URL target.                                     |
| `load_skill`       | Skill-name target.                              |
| `get_current_time` | Current-time target.                            |

`ask_user` does not need a summary because it does not render through `ToolExecutionCard`. If `ask_user` reaches `get-tool-pill-content.ts`, treat that as a component-boundary bug and throw an assertion-style error instead of falling back.

Fallback behavior: if parsing or schema validation fails for a tool that does render through `ToolExecutionCard`, use `toolName` as the target, `code` as `targetKind`, and `null` as the tool-owned detail. The shell still renders `displayName` and the status-derived execution meta.

### Component Boundaries

Keep the existing MVVM shape:

- `ToolExecutionCard.tsx` remains the container that reads `useToolOutput(callId)`.
- `ToolExecutionCardView.tsx` remains the stateless view.
- Add `ToolExecutionCard/helpers/pill-content/` for the pill dispatcher, fallback, types, and per-tool adapters.
- Keep `ParametersSection` and `ResultSection` as internal detail components.

No parent layout rules such as margins or alignment should move into `ToolExecutionCard` styles. The row/card can define its own internal dimensions, padding, border, and overflow.

## Accessibility

- Preserve the HeroUI `Disclosure` trigger and content semantics.
- The entire compact row remains the disclosure trigger.
- Icons are decorative when the text already states the status; otherwise add accessible status text through the trigger label.
- Do not rely on color alone for failure/error status. Keep icon shape and meta text.

## Testing

Add focused coverage for compact pill content:

- Per-tool pill adapters extract their own file paths, commands, queries, URLs, patterns, and skill names.
- `get-tool-pill-content.ts` falls back safely on malformed JSON or adapter parse failures.
- The shell returns status-derived execution meta for `running`, `done`, `failure`, and `error`.

Existing rendering tests should continue to cover message transformation. Add a component test only if the row behavior or disclosure rendering becomes conditional enough that helper tests are insufficient.

## Files Likely to Change

- `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/ToolExecutionCardView.tsx`
- `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/styles.module.css`
- New files under `ToolExecutionCard/helpers/pill-content/` for `get-tool-pill-content.ts`, fallback content, types, per-tool adapters, and focused tests.
