# Tool Structured Result

GitHub Issue: #100

## Problem

`ToolExecuteResult` returns `{ content: string, status }`. The `content` is a plain text string assembled from structured variables inside each tool. The frontend receives this text via SSE and can only display it as-is — no syntax highlighting, no diff viewer, no structured rendering.

## Goal

Make tool execution results fully typed end-to-end: tool returns structured data alongside LLM text, SSE transmits both, frontend receives typed data it can render with custom views (custom views are out of scope for this task).

## Design

### New Package: `@omnicraft/tool-schemas`

A shared package that both backend and frontend depend on. Contains:

1. **Tool name constants** — single source of truth for tool name strings.
2. **Per-tool result schemas** — Zod schemas defining the structured data each tool returns on success.
3. **Unified result data schema** — union of all tool result schemas plus failure shape.
4. **Type utilities** — `ToolName`, `ToolResultData<K>`, etc.

Dependency graph:

```
tool-schemas ← sse-events ← backend / frontend
```

### Tool Name Constants

```typescript
export const TOOL_NAME = {
  READ_FILE: 'read_file',
  EDIT_FILE: 'edit_file',
  WRITE_FILE: 'write_file',
  FIND_FILES: 'find_files',
  SEARCH_FILES: 'search_files',
  RUN_COMMAND: 'run_command',
  GET_CURRENT_TIME: 'get_current_time',
  WEB_FETCH: 'web_fetch',
  WEB_FETCH_RAW: 'web_fetch_raw',
  WEB_SEARCH: 'web_search',
  LOAD_SKILL: 'load_skill',
} as const;

export type ToolName = (typeof TOOL_NAME)[keyof typeof TOOL_NAME];

/** Zod schema for runtime validation of tool names. */
export const toolNameSchema = z.enum([
  TOOL_NAME.READ_FILE,
  TOOL_NAME.WRITE_FILE,
  TOOL_NAME.EDIT_FILE,
  TOOL_NAME.FIND_FILES,
  TOOL_NAME.SEARCH_FILES,
  TOOL_NAME.RUN_COMMAND,
  TOOL_NAME.GET_CURRENT_TIME,
  TOOL_NAME.WEB_FETCH,
  TOOL_NAME.WEB_FETCH_RAW,
  TOOL_NAME.WEB_SEARCH,
  TOOL_NAME.LOAD_SKILL,
]);
```

Backend tool definitions reference `TOOL_NAME` instead of hardcoded strings:

```typescript
export const editFileTool = {
  name: TOOL_NAME.EDIT_FILE,
  // ...
};
```

### Per-Tool Result Schemas

Each schema captures the structured variables already available inside the tool's `execute` method.

**read_file:**

```typescript
export const readFileResultSchema = z.object({
  filePath: z.string(),
  totalLines: z.number(),
  startLine: z.number(),
  endLine: z.number(),
  content: z.string(),
});
```

**write_file:**

```typescript
export const writeFileResultSchema = z.object({
  filePath: z.string(),
  lineCount: z.number(),
});
```

**edit_file:**

```typescript
export const editFileResultSchema = z.object({
  filePath: z.string(),
  matchCount: z.number(),
  diff: z.string(),
  truncated: z.boolean(),
});
```

**find_files:**

```typescript
export const findFilesResultSchema = z.object({
  pattern: z.string(),
  basePath: z.string(),
  files: z.array(z.string()),
  truncated: z.boolean(),
});
```

**search_files:**

```typescript
export const searchFilesResultSchema = z.object({
  pattern: z.string(),
  basePath: z.string(),
  matches: z.array(
    z.object({
      file: z.string(),
      line: z.number(),
      content: z.string(),
    }),
  ),
  truncated: z.boolean(),
});
```

**run_command:**

```typescript
export const runCommandResultSchema = z.object({
  command: z.string(),
  exitCode: z.number(),
  timedOut: z.boolean(),
  cwd: z.string(),
  stdout: z.string(),
  stderr: z.string(),
});
```

`stdout` / `stderr`: inline content when available, `"Output saved to file: /tmp/xxx"` when output is too large.

**get_current_time:**

```typescript
export const getCurrentTimeResultSchema = z.object({
  iso: z.string(),
});
```

**web_fetch:**

```typescript
export const webFetchResultSchema = z.object({
  url: z.string(),
  title: z.string().optional(),
  content: z.string(),
});
```

**web_fetch_raw:**

```typescript
export const webFetchRawResultSchema = z.object({
  url: z.string(),
  content: z.string(),
});
```

**web_search:**

```typescript
export const webSearchResultSchema = z.object({
  results: z.array(
    z.object({
      title: z.string(),
      url: z.string(),
      score: z.number(),
      content: z.string(),
    }),
  ),
});
```

**load_skill:**

```typescript
export const loadSkillResultSchema = z.object({
  name: z.string(),
  content: z.string(),
});
```

### Schema Registry

Maps tool name to its result schema, enabling frontend dispatch:

```typescript
export const toolResultSchemas = {
  [TOOL_NAME.READ_FILE]: readFileResultSchema,
  [TOOL_NAME.EDIT_FILE]: editFileResultSchema,
  [TOOL_NAME.WRITE_FILE]: writeFileResultSchema,
  [TOOL_NAME.FIND_FILES]: findFilesResultSchema,
  [TOOL_NAME.SEARCH_FILES]: searchFilesResultSchema,
  [TOOL_NAME.RUN_COMMAND]: runCommandResultSchema,
  [TOOL_NAME.GET_CURRENT_TIME]: getCurrentTimeResultSchema,
  [TOOL_NAME.WEB_FETCH]: webFetchResultSchema,
  [TOOL_NAME.WEB_FETCH_RAW]: webFetchRawResultSchema,
  [TOOL_NAME.WEB_SEARCH]: webSearchResultSchema,
  [TOOL_NAME.LOAD_SKILL]: loadSkillResultSchema,
} as const;

export type ToolResultData<K extends ToolName> = z.infer<
  (typeof toolResultSchemas)[K]
>;
```

### Unified Data Schema

Union of all result schemas plus the failure shape:

```typescript
export const toolFailureDataSchema = z.object({message: z.string()});
export type ToolFailureData = z.infer<typeof toolFailureDataSchema>;

export const toolResultDataSchema = z.union([
  readFileResultSchema,
  writeFileResultSchema,
  editFileResultSchema,
  findFilesResultSchema,
  searchFilesResultSchema,
  runCommandResultSchema,
  getCurrentTimeResultSchema,
  webFetchResultSchema,
  webFetchRawResultSchema,
  webSearchResultSchema,
  loadSkillResultSchema,
  toolFailureDataSchema,
]);

export type AnyToolResultData = z.infer<typeof toolResultDataSchema>;
```

### Backend: `ToolExecuteResult` Type Change

In `agent-core/tool/types.ts`:

```typescript
export interface ToolExecuteSuccessResult<T> {
  readonly data: T;
  readonly content: string;
  readonly status: 'success';
}

export interface ToolExecuteFailureResult {
  readonly data: ToolFailureData;
  readonly content: string;
  readonly status: 'failure';
}

export type ToolExecuteResult<T> =
  | ToolExecuteSuccessResult<T>
  | ToolExecuteFailureResult;
```

`ToolDefinition` adds a `resultSchema` field and a second generic parameter:

```typescript
export interface ToolDefinition<
  TParams extends z.ZodType = z.ZodType,
  TResult = unknown,
> {
  readonly name: string;
  readonly displayName: string;
  readonly description: string;
  readonly parameters: TParams;
  readonly resultSchema: z.ZodType<TResult>;
  execute(
    args: z.infer<TParams>,
    context: ToolExecutionContext,
    onOutput?: (chunk: string) => void,
  ): Promise<ToolExecuteResult<TResult>> | ToolExecuteResult<TResult>;
}
```

`ToolExecuteStatus` type is removed — the status is expressed by the discriminated union.

### Backend: Tool Implementation Changes

Each tool's `execute` method changes from:

```typescript
return {
  content: `File edited: ${filePath} (${matchCount} replacement(s))\n${diff}`,
  status: 'success',
};
```

To:

```typescript
const data = {filePath, matchCount, diff, truncated: false};
return {
  data,
  content: `File edited: ${filePath} (${matchCount} replacement(s))\n${diff}`,
  status: 'success',
};
```

Failure returns change from:

```typescript
return {content: 'Error: File not found', status: 'failure'};
```

To:

```typescript
return {
  data: {message: 'File not found'},
  content: 'Error: File not found',
  status: 'failure',
};
```

Each tool definition also adds `resultSchema`:

```typescript
export const editFileTool: ToolDefinition<typeof parameters, EditFileResult> = {
  name: TOOL_NAME.EDIT_FILE,
  resultSchema: editFileResultSchema,
  // ...
};
```

### Backend: Agent Layer Changes

In `agent-core/agent/agent.ts`, the `executeTool` method returns `data` alongside `content` and `status`:

```typescript
private async executeTool(
  toolCall: LlmToolCall,
  availableTools: ReadonlyMap<string, ToolDefinition>,
  onOutput: (chunk: string) => void,
  signal: AbortSignal,
): Promise<{ content: string; status: 'success' | 'failure' | 'error'; data: AnyToolResultData }> {
  const tool = availableTools.get(toolCall.toolName);
  if (!tool) {
    const message = `Unknown tool: ${toolCall.toolName}`;
    return { content: `Error: ${message}`, status: 'error', data: { message } };
  }

  try {
    const result = await tool.execute(parsedArgs, context, onOutput);
    return { content: result.content, status: result.status, data: result.data };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: `Error: ${message}`, status: 'error', data: { message } };
  }
}
```

SSE end event emission adds `data`:

```typescript
const endEvent = {
  type: 'tool-execute-end' as const,
  callId: toolCall.callId,
  result: result.content,
  status: result.status,
  data: result.data,
} satisfies SseToolExecuteEndEvent;
```

LLM tool result submission is unchanged — it only uses `content`:

```typescript
toolResults.set(toolCall.callId, {
  callId: toolCall.callId,
  content: result.content,
});
```

### SSE Schema Changes

In `packages/sse-events/src/schema.ts`, the `tool-execute-end` event gains a typed `data` field:

```typescript
import {toolNameSchema, toolResultDataSchema} from '@omnicraft/tool-schemas';

export const sseToolExecuteStartEventSchema = z.object({
  type: z.literal('tool-execute-start'),
  callId: z.string(),
  toolName: toolNameSchema, // ← was z.string()
  displayName: z.string(),
  arguments: z.string(),
});

export const sseToolExecuteEndEventSchema = z.object({
  type: z.literal('tool-execute-end'),
  callId: z.string(),
  result: z.string(),
  status: z.enum(['success', 'failure', 'error']),
  data: toolResultDataSchema,
});
```

`tool-execute-delta` is unchanged.

### Frontend Data Flow Changes

**`useMessages.ts`** — No changes needed. It stores raw SSE events; the `SseToolExecuteEndEvent` type already includes `data`.

**`useMessageList.ts`** — `ToolExecutionRenderItem` becomes a discriminated union on `toolName`:

```typescript
type ToolExecutionRenderItem =
  | RunningToolExecutionRenderItem
  | FailedToolExecutionRenderItem
  | {
      [K in ToolName]: {
        type: 'tool-execution';
        callId: string;
        toolName: K;
        displayName: string;
        arguments: string;
        status: 'done';
        result: string;
        data: ToolResultData<K>;
      };
    }[ToolName];

interface RunningToolExecutionRenderItem {
  type: 'tool-execution';
  callId: string;
  toolName: ToolName;
  displayName: string;
  arguments: string;
  status: 'running';
}

interface FailedToolExecutionRenderItem {
  type: 'tool-execution';
  callId: string;
  toolName: ToolName;
  displayName: string;
  arguments: string;
  status: 'failure' | 'error';
  result: string;
  data: ToolFailureData;
}
```

When constructing render items, the end event's `data` is passed through.

**`ToolExecutionCard.tsx` / `ToolExecutionCardView.tsx`** — Props updated to include `data`. No new UI logic in this task; the data is passed through and available for future custom views.

**`RenderItem.tsx`** — Passes `data` from render item to `ToolExecutionCard`.

## Files Changed

| Layer               | Files                                                                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| New package         | `packages/tool-schemas/` (package.json, src/index.ts, per-tool schema files)                                                                   |
| SSE schema          | `packages/sse-events/src/schema.ts`, `packages/sse-events/package.json`                                                                        |
| Backend types       | `apps/backend/src/agent-core/tool/types.ts`                                                                                                    |
| Backend agent       | `apps/backend/src/agent-core/agent/agent.ts`                                                                                                   |
| Backend tools       | All 10 tool files in `apps/backend/src/agent/tools/` + `agent-core/tool/load-skill.ts`                                                         |
| Frontend hooks      | `apps/frontend/src/pages/chat/hooks/useMessages.ts` (type only), `apps/frontend/src/pages/chat/components/MessageList/hooks/useMessageList.ts` |
| Frontend components | `ToolExecutionCard.tsx`, `ToolExecutionCardView.tsx`, `RenderItem.tsx`                                                                         |
| Tests               | Tool tests, `useMessageList.test.ts`                                                                                                           |

## Out of Scope

- Custom frontend views per tool (diff viewer, syntax highlighting, terminal UI) — tracked in separate issue.
- New tools — this task covers the 11 existing tools only.
