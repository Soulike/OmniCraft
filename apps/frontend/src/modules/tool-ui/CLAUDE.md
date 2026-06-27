# tool-ui Module

The UI for the **tool catalog** — renders a single tool execution (parameters,
result, live output) for any of the tools defined in `@omnicraft/tool-schemas`.

`ToolExecutionCardView` is the entry point. It is a **stateless view**: it
takes the tool execution as plain props and renders it.

```ts
ToolExecutionCardView({
  toolName, // ToolName — selects the per-tool parameter/result renderer
  displayName, // label shown in the header
  arguments, // raw JSON arguments string (parsed per the tool's schema)
  status, // 'running' | 'done' | 'failure' | 'error'
  result, // raw result string (fallback display)
  data, // AnyToolResultData — parsed per the tool's result schema
  output, // live streaming output, supplied by the caller
});
```

## Why this is its own module (not chat-stream, not chat-ui-components)

A tool execution's UI is bound to the tool catalog, not to any one chat
transport. This module depends on `@omnicraft/tool-schemas` (a neutral
FE/BE contract, like `@omnicraft/sse-events`) to dispatch on `toolName` and
validate each tool's parameters/result — that coupling is intrinsic and
appropriate. It does **not** depend on the chat event bus, the SSE event types,
or any `chat-stream` internals.

That makes the whole unit reusable across different event streams: to render
tool UI from a brand-new SSE stream you only need to **map your stream's events
to the tool-schema shapes** (`toolName` + `arguments` + `status` + `result` +
`data`) and supply `output`. The dispatch/parse/render binding is reused as-is.

It is therefore deliberately separate from `@/modules/chat-ui-components`, which
holds the truly tool-agnostic chat cards and stays free of `tool-schemas`.

## Structure

- `ToolExecutionCardView.tsx` — the card shell (disclosure, status, header pill,
  parameters/output/result sections).
- `components/ParametersSection`, `components/ResultSection` — dispatchers that
  `switch (toolName)`, parse with the tool's schema, and render the matching
  per-tool widget with plain props.
- `components/<Tool>Result`, `components/ParametersSection/components/<Tool>Parameters`
  — the per-tool presentation widgets (plain props, no schema imports).
- `helpers/pill-content` — builds the header pill from `toolName` + arguments.

## Consumers

- `chat-stream`'s `ToolExecutionCard` — the thin container that reads the live
  `useToolOutput(callId)` and feeds `output` into this view.
