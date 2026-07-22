# MCP Tools Support (Backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let OmniCraft connect to external MCP tool servers (local stdio + remote Streamable HTTP) and expose their tools to the chat and coding agents — backend only.

**Architecture:** A standalone `McpManager` subsystem owns MCP connections, tool discovery, and `callTool`, keeping an in-memory snapshot per server. A thin, per-`AgentType` `McpToolRegistry` presents discovered tools through the existing tool seam so the agent loop, executor, and SSE emission are reused unchanged. `ToolDefinition` becomes a discriminated union (`kind: 'internal'` Zod tools vs `kind: 'mcp'` raw-JSON-Schema tools). Server config lives in a new `mcp` settings section; `SettingsManager` gains a `change` event that drives `McpManager.applyConfig`.

**Tech Stack:** TypeScript (ESM, NodeNext), Node ≥24 via `tsx`, PNPM workspaces, Koa 3, Zod 4, Vitest, `@modelcontextprotocol/sdk` (new).

**Spec:** `docs/superpowers/specs/2026-07-22-mcp-tools-support-design.md`

## Global Constraints

- **Package manager: PNPM.** Add deps with `pnpm --filter <pkg> add <name>` — never hand-edit versions.
- **Never `any`.** Use `unknown` + narrowing.
- **No re-exporting** a workspace package's exports from a local module — import directly.
- **Node.js runtime APIs only** (`node:*`).
- **Early-return style** for `if`.
- **File naming:** common files dash-case; unit test `<file>.test.ts`.
- **Settings schema must stay `z.toJSONSchema()`-convertible** (a test enforces it) — no `z.function()`/`z.transform()`.
- **TDD, frequent commits.** Run per-package checks with `pnpm --filter @omnicraft/<pkg> test` / `... typecheck`.
- **Do not** re-run compile/test solely because the pre-commit hook formatted files.

---

### Task 1: Relocate `AgentType` to `@omnicraft/settings-schema`

`settings-schema` cannot depend on `api-schema` (dependency runs the other way), so the `mcp` section's `AgentType`-keyed enablement needs `AgentType` in `settings-schema`. It currently lives in `api-schema` with **zero external consumers**, so move it down.

**Files:**

- Create: `packages/settings-schema/src/agent-type/schema.ts`
- Modify: `packages/settings-schema/src/index.ts`
- Delete: `packages/api-schema/src/agent-type/schema.ts`
- Modify: `packages/api-schema/src/index.ts:7` (remove the re-export)
- Test: `packages/settings-schema/src/agent-type/schema.test.ts`

**Interfaces:**

- Produces: `AgentType` (const object `{CHAT:'chat',CODING:'coding'}` + type), `agentTypeSchema` (`z.enum(['chat','coding'])`), exported from `@omnicraft/settings-schema`.

- [ ] **Step 1: Create the moved schema file**

`packages/settings-schema/src/agent-type/schema.ts`:

```ts
import {z} from 'zod';

/** Discriminator for the type of agent backing a session. */
export const AgentType = {
  CHAT: 'chat',
  CODING: 'coding',
} as const;

export type AgentType = (typeof AgentType)[keyof typeof AgentType];

export const agentTypeSchema = z.enum(['chat', 'coding']);
```

- [ ] **Step 2: Export it from the settings-schema barrel**

Add to `packages/settings-schema/src/index.ts`:

```ts
export {AgentType, agentTypeSchema} from './agent-type/schema.js';
```

- [ ] **Step 3: Remove it from api-schema**

Delete `packages/api-schema/src/agent-type/schema.ts`. In `packages/api-schema/src/index.ts`, delete the line:

```ts
export {AgentType, agentTypeSchema} from './agent-type/schema.js';
```

- [ ] **Step 4: Write the test**

`packages/settings-schema/src/agent-type/schema.test.ts`:

```ts
import {describe, expect, it} from 'vitest';

import {AgentType, agentTypeSchema} from './schema.js';

describe('agentTypeSchema', () => {
  it('accepts the known agent types', () => {
    expect(agentTypeSchema.parse('chat')).toBe('chat');
    expect(agentTypeSchema.parse('coding')).toBe('coding');
  });

  it('rejects unknown agent types', () => {
    expect(agentTypeSchema.safeParse('other').success).toBe(false);
  });

  it('exposes constants matching the enum', () => {
    expect(agentTypeSchema.options).toEqual([AgentType.CHAT, AgentType.CODING]);
  });
});
```

- [ ] **Step 5: Verify both packages typecheck and test**

Run: `pnpm --filter @omnicraft/settings-schema test && pnpm --filter @omnicraft/settings-schema typecheck && pnpm --filter @omnicraft/api-schema typecheck`
Expected: PASS (api-schema has no remaining references to the moved symbols).

- [ ] **Step 6: Commit**

```bash
git add packages/settings-schema/src/agent-type packages/settings-schema/src/index.ts packages/api-schema/src/agent-type packages/api-schema/src/index.ts
git commit -m "refactor(settings-schema): relocate AgentType from api-schema"
```

---

### Task 2: Add the `mcp` settings section

**Files:**

- Create: `packages/settings-schema/src/mcp/schema.ts`
- Modify: `packages/settings-schema/src/schema.ts`
- Modify: `packages/settings-schema/src/index.ts`
- Test: `packages/settings-schema/src/schema.test.ts` (extend), `packages/settings-schema/src/mcp/schema.test.ts` (new)

**Interfaces:**

- Consumes: `AgentType`, `agentTypeSchema` (Task 1).
- Produces: `mcpSettingsSchema`, `type McpSettings`, `type McpServer`, `type McpTransport` exported from `@omnicraft/settings-schema`; `settings.mcp` on the root `Settings`.

- [ ] **Step 1: Create the mcp schema**

`packages/settings-schema/src/mcp/schema.ts`:

```ts
import {z} from 'zod';

import {AgentType, agentTypeSchema} from '../agent-type/schema.js';

const mcpTransportSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('stdio'),
    command: z.string().describe('Executable to spawn'),
    args: z.array(z.string()).describe('Command arguments').default([]),
    env: z
      .record(z.string(), z.string())
      .describe('Extra environment variables')
      .default({}),
  }),
  z.object({
    type: z.literal('http'),
    url: z.url().describe('Streamable HTTP endpoint URL'),
    headers: z
      .record(z.string(), z.string())
      .describe('Extra request headers')
      .default({}),
  }),
]);

export type McpTransport = z.infer<typeof mcpTransportSchema>;

const mcpServerSchema = z.object({
  name: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]*$/)
    .describe(
      'Unique server id; also namespaces its tools as mcp__<name>__<tool>',
    ),
  transport: mcpTransportSchema,
});

export type McpServer = z.infer<typeof mcpServerSchema>;

const enabledByAgentSchema = z.object({
  [AgentType.CHAT]: z
    .array(z.string())
    .describe('Server names enabled for the chat agent')
    .default([]),
  [AgentType.CODING]: z
    .array(z.string())
    .describe('Server names enabled for the coding agent')
    .default([]),
} satisfies Record<AgentType, z.ZodType>);

export const mcpSettingsSchema = z.object({
  servers: z
    .array(mcpServerSchema)
    .describe('Configured MCP servers')
    .default([]),
  enabledByAgent: enabledByAgentSchema.prefault({}),
});

export type McpSettings = z.infer<typeof mcpSettingsSchema>;
```

_Note: `agentTypeSchema` is imported so a new `AgentType` forces a compile error via the `satisfies` guard even though the keys use `AgentType.*` constants._

- [ ] **Step 2: Compose into the root schema**

In `packages/settings-schema/src/schema.ts`, import and add the section:

```ts
import {mcpSettingsSchema} from './mcp/schema.js';
// ...
export const settingsSchema = z.object({
  llm: llmSettingsSchema.prefault({}),
  codingLlm: llmSettingsSchema.prefault({}),
  agent: agentSettingsSchema.prefault({}),
  search: searchSettingsSchema.prefault({}),
  fileAccess: fileAccessSettingsSchema.prefault({}),
  mcp: mcpSettingsSchema.prefault({}),
});
```

- [ ] **Step 3: Export from the barrel**

Add to `packages/settings-schema/src/index.ts`:

```ts
export {
  type McpServer,
  type McpSettings,
  mcpSettingsSchema,
  type McpTransport,
} from './mcp/schema.js';
```

- [ ] **Step 4: Write the mcp schema tests**

`packages/settings-schema/src/mcp/schema.test.ts`:

```ts
import {describe, expect, it} from 'vitest';
import {z} from 'zod';

import {AgentType} from '../agent-type/schema.js';
import {mcpSettingsSchema} from './schema.js';

describe('mcpSettingsSchema', () => {
  it('defaults to no servers and empty per-agent enablement', () => {
    const parsed = mcpSettingsSchema.parse({});
    expect(parsed.servers).toEqual([]);
    expect(parsed.enabledByAgent[AgentType.CHAT]).toEqual([]);
    expect(parsed.enabledByAgent[AgentType.CODING]).toEqual([]);
  });

  it('parses a stdio server', () => {
    const parsed = mcpSettingsSchema.parse({
      servers: [
        {name: 'fs', transport: {type: 'stdio', command: 'npx', args: ['x']}},
      ],
      enabledByAgent: {chat: ['fs']},
    });
    expect(parsed.servers[0]?.transport).toMatchObject({
      type: 'stdio',
      command: 'npx',
    });
    expect(parsed.enabledByAgent[AgentType.CHAT]).toEqual(['fs']);
  });

  it('parses an http server with headers', () => {
    const parsed = mcpSettingsSchema.parse({
      servers: [
        {
          name: 'remote',
          transport: {type: 'http', url: 'https://x.example/mcp'},
        },
      ],
    });
    expect(parsed.servers[0]?.transport).toMatchObject({type: 'http'});
  });

  it('rejects a non-kebab-case server name', () => {
    const result = mcpSettingsSchema.safeParse({
      servers: [{name: 'Bad Name', transport: {type: 'stdio', command: 'x'}}],
    });
    expect(result.success).toBe(false);
  });

  it('is convertible to JSON Schema', () => {
    expect(() => z.toJSONSchema(mcpSettingsSchema)).not.toThrow();
  });
});
```

- [ ] **Step 5: Assert the root schema still converts**

Add to `packages/settings-schema/src/schema.test.ts` inside the existing `settingsSchema` describe:

```ts
it('includes mcp defaults and still converts to JSON Schema', () => {
  const parsed = settingsSchema.parse({});
  expect(parsed.mcp.servers).toEqual([]);
  expect(() => z.toJSONSchema(settingsSchema)).not.toThrow();
});
```

- [ ] **Step 6: Run tests**

Run: `pnpm --filter @omnicraft/settings-schema test`
Expected: PASS (including the pre-existing `toJSONSchema` test).

- [ ] **Step 7: Commit**

```bash
git add packages/settings-schema/src/mcp packages/settings-schema/src/schema.ts packages/settings-schema/src/index.ts packages/settings-schema/src/schema.test.ts
git commit -m "feat(settings-schema): add mcp servers + per-agent enablement section"
```

---

### Task 3: `SettingsManager` change events

`McpManager` reacts to settings changes without coupling the settings service to MCP. `save()` is the single persistence choke-point; emit after it completes.

**Files:**

- Modify: `apps/backend/src/models/settings-manager/settings-manager.ts`
- Test: `apps/backend/src/models/settings-manager/settings-manager.test.ts` (extend)

**Interfaces:**

- Produces: `SettingsManager.onChange(listener: (settings: Settings) => void): () => void` (returns unsubscribe); `SettingsManager.dispose(): void`; `resetInstanceForTesting()` calls `dispose()`.

- [ ] **Step 1: Write failing tests**

Add to `apps/backend/src/models/settings-manager/settings-manager.test.ts` (follow the file's existing setup for creating a manager over a temp file; mirror the existing tests' `SettingsManager.create(tmpPath)` + `resetInstanceForTesting()` teardown):

```ts
describe('onChange', () => {
  it('notifies listeners after a successful setBatch with the new settings', async () => {
    const {manager} = await SettingsManager.create(tmpPath);
    const seen: number[] = [];
    manager.onChange((s) => seen.push(s.agent.maxToolRounds));

    await manager.setBatch([{keyPath: ['agent', 'maxToolRounds'], value: 7}]);
    await Promise.resolve(); // allow the post-save microtask to run

    expect(seen).toEqual([7]);
  });

  it('stops notifying after unsubscribe', async () => {
    const {manager} = await SettingsManager.create(tmpPath);
    const seen: number[] = [];
    const off = manager.onChange((s) => seen.push(s.agent.maxToolRounds));
    off();

    await manager.setBatch([{keyPath: ['agent', 'maxToolRounds'], value: 5}]);
    await Promise.resolve();

    expect(seen).toEqual([]);
  });

  it('isolates a throwing listener so the write still succeeds', async () => {
    const {manager} = await SettingsManager.create(tmpPath);
    manager.onChange(() => {
      throw new Error('boom');
    });

    await expect(
      manager.setBatch([{keyPath: ['agent', 'maxToolRounds'], value: 9}]),
    ).resolves.toBeUndefined();
    expect((await manager.getAll()).agent.maxToolRounds).toBe(9);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm --filter @omnicraft/backend test -- settings-manager`
Expected: FAIL (`manager.onChange is not a function`).

- [ ] **Step 3: Implement the emitter**

In `apps/backend/src/models/settings-manager/settings-manager.ts`:

Add a private field and API on the class:

```ts
  private readonly changeListeners = new Set<(settings: Settings) => void>();

  /** Subscribes to settings changes; returns an unsubscribe function. */
  onChange(listener: (settings: Settings) => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  /** Clears all change listeners. */
  dispose(): void {
    this.changeListeners.clear();
  }

  private notifyChange(settings: Settings): void {
    // Run after the current ioQueue task to avoid re-entrancy, and isolate
    // listener failures so a bad subscriber cannot fail the write.
    queueMicrotask(() => {
      for (const listener of this.changeListeners) {
        try {
          listener(settings);
        } catch (e) {
          logger.warn(e, 'settings onChange listener threw');
        }
      }
    });
  }
```

In `save()`, emit after the atomic rename with the validated settings just written:

```ts
  private async save(settings: Settings): Promise<void> {
    const dir = path.dirname(this.filePath);
    await mkdir(dir, {recursive: true});
    const tmpPath = this.filePath + '.tmp';
    await writeFile(tmpPath, JSON.stringify(settings, null, 2) + '\n');
    await rename(tmpPath, this.filePath);
    this.notifyChange(settings);
  }
```

Update `resetInstanceForTesting` to dispose first:

```ts
  static resetInstanceForTesting(): void {
    SettingsManager.instance?.dispose();
    SettingsManager.instance = null;
  }
```

- [ ] **Step 4: Run to confirm pass**

Run: `pnpm --filter @omnicraft/backend test -- settings-manager`
Expected: PASS.

_Note: `save()` also runs during `create()`'s reset-to-defaults path; there are no listeners then, so the emit is a harmless no-op._

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/models/settings-manager
git commit -m "feat(backend): emit change event from SettingsManager.save()"
```

---

### Task 4a: Introduce the discriminated tool-definition union

Add the union types and tag every existing tool `internal`, with **no behavior change** and no widened signatures yet.

**Files:**

- Modify: `apps/backend/src/agent-core/tool/types.ts`
- Modify: all internal tool literals (18) + `load-skill.ts` + `tool/testing.ts` `createMockTool`

**Interfaces:**

- Produces: `interface ToolDefinitionBase`; `ToolDefinition<TParams, TResult>` (now `extends ToolDefinitionBase`, adds `readonly kind: 'internal'`); `interface McpToolDefinition extends ToolDefinitionBase` (`readonly kind: 'mcp'`, `readonly inputJsonSchema: Record<string, unknown>`, `execute(args: unknown, ...)`); `type AnyToolDefinition = ToolDefinition | McpToolDefinition`.

- [ ] **Step 1: Rewrite the type block in `types.ts`**

Replace the existing `ToolDefinition` interface with:

```ts
/** Fields common to every tool, regardless of origin. */
interface ToolDefinitionBase {
  readonly name: string;
  readonly displayName: string;
  readonly description: string;
  readonly suppressToolEvents: boolean;
  readonly compactResult?: (input: ToolCompactResultInput) => string | null;
}

/**
 * An internal, in-repo tool.
 *
 * - `parameters`: Zod schema used for type inference, runtime validation,
 *   and JSON Schema generation for LLM APIs.
 * - `execute`: Receives validated args and execution context.
 */
export interface ToolDefinition<
  TParams extends z.ZodType = z.ZodType,
  TResult = unknown,
> extends ToolDefinitionBase {
  readonly kind: 'internal';
  readonly parameters: TParams;
  execute(
    args: z.infer<TParams>,
    context: ToolExecutionContext,
    onOutput?: (chunk: string) => void,
  ): Promise<ToolExecuteResult<TResult>> | ToolExecuteResult<TResult>;
}

/**
 * An external MCP tool. Its parameter schema is raw JSON Schema fed straight to
 * the LLM SDK; args are not locally validated (the MCP server validates).
 */
export interface McpToolDefinition extends ToolDefinitionBase {
  readonly kind: 'mcp';
  readonly inputJsonSchema: Record<string, unknown>;
  execute(
    args: unknown,
    context: ToolExecutionContext,
    onOutput?: (chunk: string) => void,
  ): Promise<ToolExecuteResult<unknown>> | ToolExecuteResult<unknown>;
}

/** The tool shape the shared machinery operates on. */
export type AnyToolDefinition = ToolDefinition | McpToolDefinition;
```

Export `McpToolDefinition` and `AnyToolDefinition` from `apps/backend/src/agent-core/tool/index.ts` (add them to the existing `export type {...} from './types.js'` block).

- [ ] **Step 2: Tag every internal tool literal**

Add `kind: 'internal',` as the first property of each literal below. Each is `export const xTool: ToolDefinition<...> = { name: ..., ... }` — insert `kind: 'internal',` immediately before `name:`:

```
apps/backend/src/agent/tools/file/read-file.ts
apps/backend/src/agent/tools/file/write-file.ts
apps/backend/src/agent/tools/file/edit-file.ts
apps/backend/src/agent/tools/file/find-files.ts
apps/backend/src/agent/tools/file/search-files.ts
apps/backend/src/agent/tools/bash/run-command.ts
apps/backend/src/agent/tools/core/get-current-time.ts
apps/backend/src/agent/tools/web/web-search.ts
apps/backend/src/agent/tools/web/web-fetch.ts
apps/backend/src/agent/tools/web/web-fetch-raw.ts
apps/backend/src/agent/tools/todo/todo-append.ts
apps/backend/src/agent/tools/todo/todo-list.ts
apps/backend/src/agent/tools/todo/todo-update.ts
apps/backend/src/agent/tools/todo/todo-clear.ts
apps/backend/src/agent/tools/client/ask-user.ts
apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts
apps/backend/src/agent/tools/sub-agent/resume-agent-tool.ts
apps/backend/src/agent/tools/sub-agent/list-resumable-agents-tool.ts
apps/backend/src/agent-core/tool/load-skill.ts
```

Example (`read-file.ts`):

```ts
export const readFileTool: ToolDefinition<typeof parameters, ReadFileResult> = {
  kind: 'internal',
  name: TOOL_NAME.READ_FILE,
  // ...unchanged...
};
```

- [ ] **Step 3: Tag the mock tool**

In `apps/backend/src/agent-core/tool/testing.ts`, add `kind: 'internal',` to the object returned by `createMockTool`:

```ts
return {
  kind: 'internal',
  name,
  displayName: `Mock: ${name}`,
  // ...unchanged...
};
```

- [ ] **Step 4: Typecheck + full backend test**

Run: `pnpm --filter @omnicraft/backend typecheck && pnpm --filter @omnicraft/backend test`
Expected: PASS. Any `TS2741 (kind missing)` errors point to a literal that still needs the tag — fix and re-run.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/agent-core/tool apps/backend/src/agent/tools
git commit -m "refactor(backend): make ToolDefinition a discriminated union (kind: internal)"
```

---

### Task 4b: Widen the machinery to `AnyToolDefinition` + kind-discriminate adapters/executor

**Files:**

- Modify: `apps/backend/src/agent-core/tool/tool-registry.ts`
- Modify: `apps/backend/src/agent-core/agent/catalog/agent-catalog.ts`
- Modify: `apps/backend/src/agent-core/llm-api/types.ts`
- Modify: `apps/backend/src/agent-core/llm-api/claude/helpers.ts`
- Modify: `apps/backend/src/agent-core/llm-api/openai-responses/helpers.ts`
- Modify: `apps/backend/src/agent-core/agent/agent-tool-executor.ts`
- Modify: `apps/backend/src/agent-core/agent/agent-turn-runner.ts`, `apps/backend/src/agent-core/agent/agent.ts`, and the `llm-session` files that type tool arrays (`llm-session/types.ts`, `llm-session/llm-session.ts`, `llm-session/compaction/*.ts`) — replace `ToolDefinition[]` element types with `AnyToolDefinition[]` where they hold the merged catalog.
- Test: `apps/backend/src/agent-core/llm-api/claude/helpers.test.ts` (extend or create), `apps/backend/src/agent-core/agent/agent-tool-executor.test.ts` (extend or create)

**Interfaces:**

- Consumes: `AnyToolDefinition`, `McpToolDefinition` (Task 4a).
- Produces: adapters and executor that branch on `tool.kind`.

- [ ] **Step 1: Write failing adapter + executor tests**

`apps/backend/src/agent-core/llm-api/claude/helpers.test.ts` (add):

```ts
import {describe, expect, it} from 'vitest';

import type {McpToolDefinition} from '../../tool/index.js';
import {toClaudeTool} from './helpers.js';

const mcpTool: McpToolDefinition = {
  kind: 'mcp',
  name: 'mcp__fs__read',
  displayName: 'fs: read',
  description: 'read a file',
  suppressToolEvents: false,
  inputJsonSchema: {
    type: 'object',
    properties: {path: {type: 'string'}},
    required: ['path'],
  },
  execute: () => ({content: 'ok', status: 'success', data: {}}),
};

describe('toClaudeTool with an mcp tool', () => {
  it('uses inputJsonSchema verbatim', () => {
    const tool = toClaudeTool(mcpTool);
    expect(tool.name).toBe('mcp__fs__read');
    expect(tool.input_schema).toEqual(mcpTool.inputJsonSchema);
  });
});
```

`apps/backend/src/agent-core/agent/agent-tool-executor.test.ts` (add a case): construct an `McpToolDefinition` whose `execute` records the raw args, drive it through `agentToolExecutor` with `arguments: '{"path":"/x"}'`, and assert `execute` received `{path: '/x'}` unmodified (no Zod parse). Use `createMockContext` from `tool/testing.ts` for the context and follow the executor's existing test harness if present; otherwise call the executor's `execute` path with a minimal `RunToolInput`.

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm --filter @omnicraft/backend test -- helpers agent-tool-executor`
Expected: FAIL (adapter/executor still assume `parameters`).

- [ ] **Step 3: Widen element types**

In each file listed above, change the tool-array element type from `ToolDefinition` to `AnyToolDefinition` (imports come from `@/agent-core/tool/index.js` or the local `types.js`). This is a mechanical type-only change. Example — `tool-registry.ts`:

```ts
import type {AnyToolDefinition} from './types.js';

export abstract class ToolRegistry {
  private readonly tools = new Map<string, AnyToolDefinition>();
  protected register(tool: AnyToolDefinition): void {
    /* unchanged body */
  }
  get(name: string): AnyToolDefinition | undefined {
    return this.tools.get(name);
  }
  getAll(): AnyToolDefinition[] {
    return [...this.tools.values()];
  }
  getSystemPromptSection(): string {
    return '';
  }
}
```

`agent-catalog.ts`: change `buildAvailableTools` return to `ReadonlyMap<string, AnyToolDefinition>` and `addTool`'s param to `AnyToolDefinition`.

- [ ] **Step 4: Kind-discriminate the adapters**

`claude/helpers.ts` `toClaudeTool`:

```ts
export function toClaudeTool(tool: AnyToolDefinition): Anthropic.Tool {
  const jsonSchema =
    tool.kind === 'mcp'
      ? tool.inputJsonSchema
      : z.toJSONSchema(tool.parameters);
  assert(
    'type' in jsonSchema && jsonSchema.type === 'object',
    `Tool "${tool.name}" parameters must produce a JSON Schema with type: "object"`,
  );
  return {
    name: tool.name,
    description: tool.description,
    input_schema: jsonSchema as Anthropic.Tool.InputSchema,
  };
}
```

`openai-responses/helpers.ts` `toFunctionTool`:

```ts
export function toFunctionTool(
  tool: AnyToolDefinition,
): OpenAI.Responses.FunctionTool {
  return {
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters:
      tool.kind === 'mcp'
        ? tool.inputJsonSchema
        : z.toJSONSchema(tool.parameters),
    strict: false,
  };
}
```

- [ ] **Step 5: Kind-discriminate the executor**

In `apps/backend/src/agent-core/agent/agent-tool-executor.ts`, replace the parse+execute block:

```ts
try {
  const raw: unknown = JSON.parse(input.toolCall.arguments);
  const parsedArgs: unknown =
    tool.kind === 'mcp' ? raw : tool.parameters.parse(raw);
  const result = await tool.execute(parsedArgs, context, onOutput);
  return {
    content: result.content,
    status: result.status,
    data: result.data as AnyToolResultData,
  };
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {content: `Error: ${message}`, status: 'error', data: {message}};
}
```

(The `tool` local is already typed from the widened `availableTools` map.)

- [ ] **Step 6: Run tests + full backend suite**

Run: `pnpm --filter @omnicraft/backend test && pnpm --filter @omnicraft/backend typecheck`
Expected: PASS (new adapter/executor tests green; existing tests unchanged).

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/agent-core
git commit -m "feat(backend): kind-discriminate tool adapters/executor; widen to AnyToolDefinition"
```

---

### Task 5: FE↔BE boundary schemas (`tool-schemas`, `sse-events`)

**Files:**

- Modify: `packages/tool-schemas/src/result-schemas.ts`, `packages/tool-schemas/src/registry.ts`, `packages/tool-schemas/src/index.ts`
- Modify: `packages/sse-events/src/schema.ts`
- Test: `packages/tool-schemas/src/registry.test.ts` (or extend `parameter-schemas.test.ts`), `packages/sse-events` schema test if present

**Interfaces:**

- Produces: `mcpToolResultSchema` (`{server, toolName, text}`) added to `toolResultDataSchema`; `SseToolExecuteStartEvent.toolName` is `string`.

- [ ] **Step 1: Add the MCP result schema**

Append to `packages/tool-schemas/src/result-schemas.ts`:

```ts
export const mcpToolResultSchema = z.object({
  server: z.string(),
  toolName: z.string(),
  text: z.string(),
});
```

- [ ] **Step 2: Add it to the result union + export**

In `packages/tool-schemas/src/registry.ts`, import `mcpToolResultSchema` and add it to the `toolResultDataSchema` union array (before `toolFailureDataSchema`). In `packages/tool-schemas/src/index.ts`, add `mcpToolResultSchema` to the `result-schemas.js` export list.

- [ ] **Step 3: Relax the SSE tool name**

In `packages/sse-events/src/schema.ts`, change `sseToolExecuteStartEventSchema`:

```ts
export const sseToolExecuteStartEventSchema = z.object({
  type: z.literal('tool-execute-start'),
  callId: z.string(),
  // Built-in tools use TOOL_NAME values; MCP tools use `mcp__<server>__<tool>`.
  toolName: z.string(),
  displayName: z.string(),
  arguments: z.string(),
});
```

Remove the now-unused `toolNameSchema` import **only if** nothing else in the file uses it (grep first: `grep -n toolNameSchema packages/sse-events/src/schema.ts`).

- [ ] **Step 4: Write tests**

`packages/tool-schemas/src/registry.test.ts` (add):

```ts
import {describe, expect, it} from 'vitest';

import {toolResultDataSchema} from './registry.js';

describe('toolResultDataSchema', () => {
  it('accepts an MCP tool result', () => {
    const parsed = toolResultDataSchema.parse({
      server: 'fs',
      toolName: 'read',
      text: 'file contents',
    });
    expect(parsed).toMatchObject({server: 'fs', toolName: 'read'});
  });
});
```

For sse-events, add (or extend the existing schema test): assert `sseEventSchema.parse({type:'tool-execute-start', callId:'c', toolName:'mcp__fs__read', displayName:'fs: read', arguments:'{}'})` succeeds.

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @omnicraft/tool-schemas test && pnpm --filter @omnicraft/sse-events test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/tool-schemas packages/sse-events
git commit -m "feat(contracts): add mcp tool result; allow dynamic tool names in SSE"
```

---

### Task 6: MCP dependency + `McpManager`

**Files:**

- Modify: `apps/backend/package.json` (via pnpm)
- Create: `apps/backend/src/models/mcp-manager/types.ts`
- Create: `apps/backend/src/models/mcp-manager/mcp-manager.ts`
- Create: `apps/backend/src/models/mcp-manager/index.ts`
- Test: `apps/backend/src/models/mcp-manager/mcp-manager.test.ts`

**Interfaces:**

- Consumes: `McpSettings`, `McpServer`, `AgentType` (`@omnicraft/settings-schema`).
- Produces:
  - `interface McpToolInfo { name: string; title?: string; description: string; inputSchema: Record<string, unknown>; }`
  - `interface McpCallResult { text: string; isError: boolean; }`
  - `interface McpServerStatus { name: string; transportType: 'stdio' | 'http'; status: 'connecting' | 'connected' | 'error' | 'disabled'; tools: {name: string; description: string}[]; error?: string; }`
  - `interface McpClient { listTools(): Promise<McpToolInfo[]>; callTool(name: string, args: unknown, signal: AbortSignal): Promise<McpCallResult>; onToolsChanged(cb: () => void): void; close(): Promise<void>; }`
  - `type McpClientFactory = (server: McpServer) => Promise<McpClient>;`
  - class `McpManager` with `constructor(createClient?: McpClientFactory)`, `applyConfig(mcp: McpSettings): void`, `getToolsForAgent(kind: AgentType): {server: string; tools: McpToolInfo[]}[]`, `callTool(server: string, tool: string, args: unknown, signal: AbortSignal): Promise<McpCallResult>`, `list(): McpServerStatus[]`, `reconnect(name: string): Promise<void>`, `dispose(): Promise<void>`, plus static `getInstance()` / `create(createClient?)` / `resetInstanceForTesting()` (mirror `SettingsManager`'s singleton shape).

- [ ] **Step 1: Install the SDK and verify its client API**

Run: `pnpm --filter @omnicraft/backend add @modelcontextprotocol/sdk`
Then open `node_modules/@modelcontextprotocol/sdk/README.md` and confirm the import subpaths and method signatures used in Step 3 (`Client`, `StdioClientTransport`, `StreamableHTTPClientTransport`, `listTools`, `callTool` options, the tool-list-changed notification schema). Adjust Step 3's adapter (`createMcpClient`) if the installed version differs. **This is the only place the SDK API is touched; everything else depends on the `McpClient` interface, not the SDK.**

- [ ] **Step 2: Write the types file**

`apps/backend/src/models/mcp-manager/types.ts`:

```ts
import type {McpServer} from '@omnicraft/settings-schema';

export interface McpToolInfo {
  readonly name: string;
  readonly title?: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
}

export interface McpCallResult {
  readonly text: string;
  readonly isError: boolean;
}

export type ServerStatus = 'connecting' | 'connected' | 'error' | 'disabled';

export interface McpServerStatus {
  readonly name: string;
  readonly transportType: 'stdio' | 'http';
  readonly status: ServerStatus;
  readonly tools: {readonly name: string; readonly description: string}[];
  readonly error?: string;
}

/** Transport-agnostic handle over one connected MCP server. */
export interface McpClient {
  listTools(): Promise<McpToolInfo[]>;
  callTool(
    name: string,
    args: unknown,
    signal: AbortSignal,
  ): Promise<McpCallResult>;
  onToolsChanged(callback: () => void): void;
  close(): Promise<void>;
}

export type McpClientFactory = (server: McpServer) => Promise<McpClient>;
```

- [ ] **Step 3: Write the manager (with the real SDK behind the factory)**

`apps/backend/src/models/mcp-manager/mcp-manager.ts` — the manager holds a per-server record and reconciles on `applyConfig`. The default `createClient` wraps the MCP SDK; tests inject a fake.

```ts
import assert from 'node:assert';

import type {
  AgentType,
  McpServer,
  McpSettings,
} from '@omnicraft/settings-schema';

import {logger} from '@/logger.js';

import {createMcpClient} from './create-mcp-client.js';
import type {
  McpCallResult,
  McpClient,
  McpClientFactory,
  McpServerStatus,
  McpToolInfo,
  ServerStatus,
} from './types.js';

interface ServerRecord {
  server: McpServer;
  kinds: Set<AgentType>;
  status: ServerStatus;
  tools: McpToolInfo[];
  error?: string;
  client?: McpClient;
  /** Bumped on each (re)connect so stale async completions can be ignored. */
  generation: number;
}

export class McpManager {
  private static instance: McpManager | null = null;

  private readonly records = new Map<string, ServerRecord>();

  private constructor(private readonly createClient: McpClientFactory) {}

  static create(createClient: McpClientFactory = createMcpClient): McpManager {
    assert(McpManager.instance === null, 'McpManager already created');
    McpManager.instance = new McpManager(createClient);
    return McpManager.instance;
  }

  static getInstance(): McpManager {
    assert(McpManager.instance !== null, 'McpManager not created');
    return McpManager.instance;
  }

  static async resetInstanceForTesting(): Promise<void> {
    await McpManager.instance?.dispose();
    McpManager.instance = null;
  }

  /** Reconciles live connections to the desired config. Returns promptly. */
  applyConfig(mcp: McpSettings): void {
    const kindsByServer = this.computeKinds(mcp);
    const desired = new Map(mcp.servers.map((s) => [s.name, s]));

    // Remove servers no longer desired or disabled everywhere.
    for (const [name, record] of this.records) {
      const kinds = kindsByServer.get(name);
      const server = desired.get(name);
      if (!server || !kinds || kinds.size === 0) {
        void this.teardown(name);
        continue;
      }
      // Reconnect if the transport definition changed; else just update kinds.
      if (
        JSON.stringify(record.server.transport) !==
        JSON.stringify(server.transport)
      ) {
        void this.teardown(name).then(() => this.connect(server, kinds));
      } else {
        record.kinds = kinds;
      }
    }

    // Add newly desired+enabled servers.
    for (const server of mcp.servers) {
      const kinds = kindsByServer.get(server.name);
      if (kinds && kinds.size > 0 && !this.records.has(server.name)) {
        this.connect(server, kinds);
      }
    }
  }

  getToolsForAgent(kind: AgentType): {server: string; tools: McpToolInfo[]}[] {
    const out: {server: string; tools: McpToolInfo[]}[] = [];
    for (const record of this.records.values()) {
      if (record.status === 'connected' && record.kinds.has(kind)) {
        out.push({server: record.server.name, tools: record.tools});
      }
    }
    return out;
  }

  async callTool(
    server: string,
    tool: string,
    args: unknown,
    signal: AbortSignal,
  ): Promise<McpCallResult> {
    const record = this.records.get(server);
    if (!record?.client || record.status !== 'connected') {
      return {text: `MCP server "${server}" is not connected`, isError: true};
    }
    return record.client.callTool(tool, args, signal);
  }

  list(): McpServerStatus[] {
    return [...this.records.values()].map((r) => ({
      name: r.server.name,
      transportType: r.server.transport.type,
      status: r.status,
      tools: r.tools.map((t) => ({name: t.name, description: t.description})),
      error: r.error,
    }));
  }

  async reconnect(name: string): Promise<void> {
    const record = this.records.get(name);
    if (!record) return;
    const {server, kinds} = record;
    await this.teardown(name);
    this.connect(server, kinds);
  }

  async dispose(): Promise<void> {
    await Promise.all(
      [...this.records.keys()].map((name) => this.teardown(name)),
    );
  }

  private computeKinds(mcp: McpSettings): Map<string, Set<AgentType>> {
    const map = new Map<string, Set<AgentType>>();
    for (const server of mcp.servers) map.set(server.name, new Set());
    for (const [kind, names] of Object.entries(mcp.enabledByAgent) as [
      AgentType,
      string[],
    ][]) {
      for (const name of names) map.get(name)?.add(kind);
    }
    return map;
  }

  private connect(server: McpServer, kinds: Set<AgentType>): void {
    const record: ServerRecord = {
      server,
      kinds,
      status: 'connecting',
      tools: [],
      generation: (this.records.get(server.name)?.generation ?? 0) + 1,
    };
    this.records.set(server.name, record);
    const gen = record.generation;

    void (async () => {
      try {
        const client = await this.createClient(server);
        if (this.isStale(server.name, gen)) {
          await client.close();
          return;
        }
        record.client = client;
        record.tools = await client.listTools();
        record.status = 'connected';
        client.onToolsChanged(() => {
          void this.refreshTools(server.name, gen);
        });
      } catch (e) {
        if (this.isStale(server.name, gen)) return;
        record.status = 'error';
        record.error = e instanceof Error ? e.message : String(e);
        logger.warn({e, server: server.name}, 'MCP server connection failed');
      }
    })();
  }

  private async refreshTools(name: string, gen: number): Promise<void> {
    const record = this.records.get(name);
    if (!record?.client || this.isStale(name, gen)) return;
    try {
      record.tools = await record.client.listTools();
    } catch (e) {
      logger.warn({e, server: name}, 'MCP tools/list refresh failed');
    }
  }

  private async teardown(name: string): Promise<void> {
    const record = this.records.get(name);
    if (!record) return;
    this.records.delete(name);
    await record.client?.close().catch(() => undefined);
  }

  private isStale(name: string, gen: number): boolean {
    return this.records.get(name)?.generation !== gen;
  }
}
```

Create `apps/backend/src/models/mcp-manager/create-mcp-client.ts` — the ONLY module importing the SDK. Use the signatures confirmed in Step 1; adjust import paths to the installed version:

```ts
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {ToolListChangedNotificationSchema} from '@modelcontextprotocol/sdk/types.js';
import type {McpServer} from '@omnicraft/settings-schema';

import type {McpCallResult, McpClient, McpToolInfo} from './types.js';

export async function createMcpClient(server: McpServer): Promise<McpClient> {
  const client = new Client({name: 'omnicraft', version: '0.0.0'});
  const transport =
    server.transport.type === 'stdio'
      ? new StdioClientTransport({
          command: server.transport.command,
          args: server.transport.args,
          env: server.transport.env,
        })
      : new StreamableHTTPClientTransport(new URL(server.transport.url), {
          requestInit: {headers: server.transport.headers},
        });
  await client.connect(transport);

  return {
    async listTools(): Promise<McpToolInfo[]> {
      const {tools} = await client.listTools();
      return tools.map((t) => ({
        name: t.name,
        title: t.title,
        description: t.description ?? '',
        inputSchema: t.inputSchema as Record<string, unknown>,
      }));
    },
    async callTool(name, args, signal): Promise<McpCallResult> {
      const result = await client.callTool(
        {name, arguments: (args ?? {}) as Record<string, unknown>},
        undefined,
        {signal},
      );
      const text = (Array.isArray(result.content) ? result.content : [])
        .map((b) => (b.type === 'text' ? b.text : `[${b.type} content]`))
        .join('\n');
      return {text, isError: result.isError === true};
    },
    onToolsChanged(callback): void {
      client.setNotificationHandler(ToolListChangedNotificationSchema, () => {
        callback();
      });
    },
    async close(): Promise<void> {
      await client.close();
    },
  };
}
```

`apps/backend/src/models/mcp-manager/index.ts`:

```ts
export {McpManager} from './mcp-manager.js';
export type {
  McpCallResult,
  McpClient,
  McpClientFactory,
  McpServerStatus,
  McpToolInfo,
} from './types.js';
```

- [ ] **Step 4: Write manager tests with a fake client**

`apps/backend/src/models/mcp-manager/mcp-manager.test.ts`:

```ts
import {afterEach, describe, expect, it, vi} from 'vitest';

import {McpManager} from './mcp-manager.js';
import type {McpClient, McpToolInfo} from './types.js';

function fakeClient(tools: McpToolInfo[]): McpClient {
  return {
    listTools: () => Promise.resolve(tools),
    callTool: (name) =>
      Promise.resolve({text: `called ${name}`, isError: false}),
    onToolsChanged: () => undefined,
    close: () => Promise.resolve(),
  };
}

const tool: McpToolInfo = {
  name: 'read',
  description: 'r',
  inputSchema: {type: 'object'},
};

afterEach(async () => {
  await McpManager.resetInstanceForTesting();
});

describe('McpManager', () => {
  it('connects enabled servers and exposes their tools per agent kind', async () => {
    const mgr = McpManager.create(() => Promise.resolve(fakeClient([tool])));
    mgr.applyConfig({
      servers: [
        {
          name: 'fs',
          transport: {type: 'stdio', command: 'x', args: [], env: {}},
        },
      ],
      enabledByAgent: {chat: ['fs'], coding: []},
    });
    await vi.waitFor(() => expect(mgr.list()[0]?.status).toBe('connected'));

    expect(mgr.getToolsForAgent('chat')).toEqual([
      {server: 'fs', tools: [tool]},
    ]);
    expect(mgr.getToolsForAgent('coding')).toEqual([]);
  });

  it('disconnects a server removed from config', async () => {
    const mgr = McpManager.create(() => Promise.resolve(fakeClient([tool])));
    mgr.applyConfig({
      servers: [
        {
          name: 'fs',
          transport: {type: 'stdio', command: 'x', args: [], env: {}},
        },
      ],
      enabledByAgent: {chat: ['fs'], coding: []},
    });
    await vi.waitFor(() => expect(mgr.list()).toHaveLength(1));

    mgr.applyConfig({servers: [], enabledByAgent: {chat: [], coding: []}});
    expect(mgr.list()).toHaveLength(0);
  });

  it('marks a server errored when connection throws, without throwing', async () => {
    const mgr = McpManager.create(() => Promise.reject(new Error('nope')));
    mgr.applyConfig({
      servers: [
        {
          name: 'fs',
          transport: {type: 'stdio', command: 'x', args: [], env: {}},
        },
      ],
      enabledByAgent: {chat: ['fs'], coding: []},
    });
    await vi.waitFor(() => expect(mgr.list()[0]?.status).toBe('error'));
    expect(mgr.list()[0]?.error).toContain('nope');
  });

  it('returns an error result when calling a tool on a disconnected server', async () => {
    const mgr = McpManager.create(() => Promise.resolve(fakeClient([tool])));
    const result = await mgr.callTool(
      'absent',
      'read',
      {},
      new AbortController().signal,
    );
    expect(result.isError).toBe(true);
  });
});
```

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm --filter @omnicraft/backend test -- mcp-manager && pnpm --filter @omnicraft/backend typecheck`
Expected: PASS. (If typecheck flags the SDK adapter, fix per the installed SDK types from Step 1.)

- [ ] **Step 6: Commit**

```bash
git add apps/backend/package.json apps/backend/src/models/mcp-manager pnpm-lock.yaml
git commit -m "feat(backend): add McpManager subsystem over @modelcontextprotocol/sdk"
```

---

### Task 7: `McpToolRegistry` + per-`AgentType` factory

**Files:**

- Create: `apps/backend/src/agent/tools/mcp/mcp-tool-registry.ts`
- Create: `apps/backend/src/agent/tools/mcp/index.ts`
- Test: `apps/backend/src/agent/tools/mcp/mcp-tool-registry.test.ts`

**Interfaces:**

- Consumes: `McpManager` (Task 6), `McpToolDefinition`/`ToolRegistry` (Task 4), `AgentType`, `mcpToolResultSchema` (Task 5).
- Produces: `class McpToolRegistry extends ToolRegistry` (`constructor(agentType: AgentType, manager?: McpManager)`); `getMcpToolRegistry(agentType: AgentType): McpToolRegistry`.

- [ ] **Step 1: Write failing tests**

`apps/backend/src/agent/tools/mcp/mcp-tool-registry.test.ts`:

```ts
import {afterEach, describe, expect, it, vi} from 'vitest';

import {McpManager} from '@/models/mcp-manager/index.js';
import type {McpClient, McpToolInfo} from '@/models/mcp-manager/index.js';

import {McpToolRegistry} from './mcp-tool-registry.js';

const tool: McpToolInfo = {
  name: 'read',
  description: 'read a file',
  inputSchema: {type: 'object', properties: {path: {type: 'string'}}},
};
const client: McpClient = {
  listTools: () => Promise.resolve([tool]),
  callTool: () => Promise.resolve({text: 'hello', isError: false}),
  onToolsChanged: () => undefined,
  close: () => Promise.resolve(),
};

afterEach(async () => {
  await McpManager.resetInstanceForTesting();
});

async function connectedManager(): Promise<McpManager> {
  const mgr = McpManager.create(() => Promise.resolve(client));
  mgr.applyConfig({
    servers: [
      {name: 'fs', transport: {type: 'stdio', command: 'x', args: [], env: {}}},
    ],
    enabledByAgent: {chat: ['fs'], coding: []},
  });
  await vi.waitFor(() => expect(mgr.list()[0]?.status).toBe('connected'));
  return mgr;
}

describe('McpToolRegistry', () => {
  it('namespaces discovered tools and exposes them for its agent kind', async () => {
    const mgr = await connectedManager();
    const registry = new McpToolRegistry('chat', mgr);
    const tools = registry.getAll();
    expect(tools.map((t) => t.name)).toEqual(['mcp__fs__read']);
    expect(tools[0]?.kind).toBe('mcp');
  });

  it('is empty for an agent kind the server is not enabled for', async () => {
    const mgr = await connectedManager();
    expect(new McpToolRegistry('coding', mgr).getAll()).toEqual([]);
  });

  it('proxies execute() to the manager and maps the result', async () => {
    const mgr = await connectedManager();
    const [t] = new McpToolRegistry('chat', mgr).getAll();
    const result = await t!.execute({path: '/x'}, {
      signal: new AbortController().signal,
    } as never);
    expect(result.status).toBe('success');
    expect(result.data).toMatchObject({
      server: 'fs',
      toolName: 'read',
      text: 'hello',
    });
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm --filter @omnicraft/backend test -- mcp-tool-registry`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the registry + factory**

`apps/backend/src/agent/tools/mcp/mcp-tool-registry.ts`:

```ts
import type {AgentType} from '@omnicraft/settings-schema';

import {ToolRegistry} from '@/agent-core/tool/index.js';
import type {
  AnyToolDefinition,
  McpToolDefinition,
} from '@/agent-core/tool/index.js';
import {McpManager} from '@/models/mcp-manager/index.js';

const NAMESPACE_SEPARATOR = '__';

function toolName(server: string, tool: string): string {
  return `mcp${NAMESPACE_SEPARATOR}${server}${NAMESPACE_SEPARATOR}${tool}`;
}

/** Presents a manager's MCP tools as ToolDefinitions for one agent kind. */
export class McpToolRegistry extends ToolRegistry {
  constructor(
    private readonly agentType: AgentType,
    private readonly manager: McpManager = McpManager.getInstance(),
  ) {
    super();
  }

  override getAll(): AnyToolDefinition[] {
    const out: McpToolDefinition[] = [];
    for (const {server, tools} of this.manager.getToolsForAgent(
      this.agentType,
    )) {
      for (const tool of tools) {
        out.push({
          kind: 'mcp',
          name: toolName(server, tool.name),
          displayName: tool.title ?? `${server}: ${tool.name}`,
          description: tool.description,
          suppressToolEvents: false,
          inputJsonSchema: tool.inputSchema,
          execute: async (args, context) => {
            const result = await this.manager.callTool(
              server,
              tool.name,
              args,
              context.signal,
            );
            if (result.isError) {
              return {
                content: result.text,
                status: 'failure',
                data: {message: result.text},
              };
            }
            return {
              content: result.text,
              status: 'success',
              data: {server, toolName: tool.name, text: result.text},
            };
          },
        });
      }
    }
    return out;
  }

  override get(name: string): AnyToolDefinition | undefined {
    return this.getAll().find((tool) => tool.name === name);
  }

  override getSystemPromptSection(): string {
    const servers = this.manager
      .getToolsForAgent(this.agentType)
      .filter((s) => s.tools.length > 0);
    if (servers.length === 0) return '';
    const lines = servers.map(
      (s) => `- ${s.server}: ${s.tools.length} tool(s)`,
    );
    return ['## MCP Servers', '', 'Connected MCP servers:', ...lines].join(
      '\n',
    );
  }
}

const registries = new Map<AgentType, McpToolRegistry>();

/** Shared, lazily-created MCP tool registry for an agent type. */
export function getMcpToolRegistry(agentType: AgentType): McpToolRegistry {
  const existing = registries.get(agentType);
  if (existing) return existing;
  const registry = new McpToolRegistry(agentType);
  registries.set(agentType, registry);
  return registry;
}
```

`apps/backend/src/agent/tools/mcp/index.ts`:

```ts
export {getMcpToolRegistry, McpToolRegistry} from './mcp-tool-registry.js';
```

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm --filter @omnicraft/backend test -- mcp-tool-registry && pnpm --filter @omnicraft/backend typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/agent/tools/mcp
git commit -m "feat(backend): McpToolRegistry bridging MCP tools into the agent seam"
```

---

### Task 8: Wire MCP into boot + agents

**Files:**

- Modify: `apps/backend/src/startup/init-services.ts`
- Modify: `apps/backend/src/agent/agents/main-agent/main-agent.ts`
- Modify: `apps/backend/src/agent/agents/coding-agent/coding-agent.ts`
- Test: `apps/backend/src/agent/agents/main-agent/main-agent.test.ts` (or a focused registry-membership test)

**Interfaces:**

- Consumes: `McpManager` (Task 6), `getMcpToolRegistry` (Task 7), `SettingsManager.onChange` (Task 3), `AgentType` (Task 1).

- [ ] **Step 1: Register the MCP registry in both agents**

In `main-agent.ts`, import and append to `toolRegistries`:

```ts
import {AgentType} from '@omnicraft/settings-schema';

import {getMcpToolRegistry} from '@/agent/tools/mcp/index.js';
// ...
        toolRegistries: [
          coreToolRegistry,
          fileToolRegistry,
          webToolRegistry,
          bashToolRegistry,
          subAgentToolRegistry,
          clientToolRegistry,
          todoToolRegistry,
          getMcpToolRegistry(AgentType.CHAT),
        ],
```

In `coding-agent.ts`, the same with `getMcpToolRegistry(AgentType.CODING)`.

- [ ] **Step 2: Initialize the manager at boot**

In `apps/backend/src/startup/init-services.ts`, add an initializer and call it after `initSettingsManager`:

```ts
import {McpManager} from '@/models/mcp-manager/index.js';
import {SettingsManager} from '@/models/settings-manager/index.js';

// inside initServices(), after await initSettingsManager():
await initMcpManager();

async function initMcpManager(): Promise<void> {
  const manager = McpManager.create();
  const settings = SettingsManager.getInstance();
  settings.onChange((next) => {
    manager.applyConfig(next.mcp);
  });
  manager.applyConfig((await settings.getAll()).mcp);
}
```

- [ ] **Step 3: Write a membership test**

`apps/backend/src/agent/agents/main-agent/main-agent.test.ts` (new or extended): construct a `MainAgent` (in-memory, no sessionsDir) after `McpManager.create(() => …fake…)` and assert its tool set includes an `mcp__`-namespaced tool once a fake server is connected. If constructing a full agent is heavy in tests, instead assert `getMcpToolRegistry(AgentType.CHAT)` is included by checking the registry returns the fake tool — reuse the fake-client setup from Task 7. Keep this test light; the manager and registry are already covered.

```ts
import {afterEach, describe, expect, it, vi} from 'vitest';

import {AgentType} from '@omnicraft/settings-schema';

import {getMcpToolRegistry} from '@/agent/tools/mcp/index.js';
import {McpManager} from '@/models/mcp-manager/index.js';

afterEach(async () => {
  await McpManager.resetInstanceForTesting();
});

describe('MCP wiring', () => {
  it('exposes connected MCP tools to the chat registry singleton', async () => {
    const mgr = McpManager.create(() =>
      Promise.resolve({
        listTools: () =>
          Promise.resolve([
            {name: 'ping', description: 'p', inputSchema: {type: 'object'}},
          ]),
        callTool: () => Promise.resolve({text: 'pong', isError: false}),
        onToolsChanged: () => undefined,
        close: () => Promise.resolve(),
      }),
    );
    mgr.applyConfig({
      servers: [
        {
          name: 'demo',
          transport: {type: 'stdio', command: 'x', args: [], env: {}},
        },
      ],
      enabledByAgent: {chat: ['demo'], coding: []},
    });
    await vi.waitFor(() => expect(mgr.list()[0]?.status).toBe('connected'));

    const names = getMcpToolRegistry(AgentType.CHAT)
      .getAll()
      .map((t) => t.name);
    expect(names).toContain('mcp__demo__ping');
  });
});
```

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm --filter @omnicraft/backend test -- main-agent && pnpm --filter @omnicraft/backend typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/startup/init-services.ts apps/backend/src/agent/agents
git commit -m "feat(backend): wire McpManager at boot and register MCP tools per agent"
```

---

### Task 9: HTTP status API (`/api/mcp/servers`)

**Files:**

- Create: `packages/api-schema/src/mcp/schema.ts`
- Modify: `packages/api-schema/src/index.ts`
- Create: `apps/backend/src/dispatcher/mcp/path.ts`, `.../router.ts`, `.../index.ts`
- Modify: `apps/backend/src/dispatcher/index.ts`
- Test: `apps/backend/src/dispatcher/mcp/router.test.ts` (if the repo has dispatcher tests) or a service-level assertion

**Interfaces:**

- Consumes: `McpManager.list()` / `reconnect()` (Task 6).
- Produces: `GET /api/mcp/servers`, `POST /api/mcp/servers/:name/reconnect`; `mcpServerStatusSchema`, `getMcpServersResponseSchema` in `@omnicraft/api-schema`.

- [ ] **Step 1: Add the response schema**

`packages/api-schema/src/mcp/schema.ts`:

```ts
import {z} from 'zod';

export const mcpServerStatusSchema = z.object({
  name: z.string(),
  transportType: z.enum(['stdio', 'http']),
  status: z.enum(['connecting', 'connected', 'error', 'disabled']),
  tools: z.array(z.object({name: z.string(), description: z.string()})),
  error: z.string().optional(),
});

export const getMcpServersResponseSchema = z.object({
  servers: z.array(mcpServerStatusSchema),
});

export type McpServerStatusResponse = z.infer<typeof mcpServerStatusSchema>;
```

Export both from `packages/api-schema/src/index.ts`.

- [ ] **Step 2: Add the route constants**

`apps/backend/src/dispatcher/mcp/path.ts`:

```ts
export const MCP_SERVERS = '/mcp/servers';
export const MCP_SERVER_RECONNECT = '/mcp/servers/:name/reconnect';
```

- [ ] **Step 3: Implement the router**

`apps/backend/src/dispatcher/mcp/router.ts`:

```ts
import Router from '@koa/router';
import {StatusCodes} from 'http-status-codes';

import {McpManager} from '@/models/mcp-manager/index.js';

import {MCP_SERVER_RECONNECT, MCP_SERVERS} from './path.js';

const router = new Router();

/** GET /mcp/servers — connection status + discovered tools per server. */
router.get(MCP_SERVERS, (ctx) => {
  ctx.response.status = StatusCodes.OK;
  ctx.response.body = {servers: McpManager.getInstance().list()};
});

/** POST /mcp/servers/:name/reconnect — force a single server reconnect. */
router.post(MCP_SERVER_RECONNECT, async (ctx) => {
  await McpManager.getInstance().reconnect(ctx.params.name);
  ctx.response.status = StatusCodes.ACCEPTED;
  ctx.response.body = {success: true};
});

export {router};
```

`apps/backend/src/dispatcher/mcp/index.ts`:

```ts
export {router} from './router.js';
```

- [ ] **Step 4: Mount it**

In `apps/backend/src/dispatcher/index.ts`, import `router as mcpRouter` from `./mcp/index.js` and add `apiRouter.use(mcpRouter.routes(), mcpRouter.allowedMethods());`.

- [ ] **Step 5: Write a router test**

`apps/backend/src/dispatcher/mcp/router.test.ts`: create the `McpManager` with a fake client, connect a server, mount the router on a Koa app (or call the handler via supertest-style if the repo has a helper — mirror any existing dispatcher test), and assert `GET /mcp/servers` returns `{servers: [{name:'fs', status:'connected', ...}]}` and that its body parses via `getMcpServersResponseSchema`. If the repo has no dispatcher HTTP-test harness, assert against `McpManager.getInstance().list()` shape parsed by `getMcpServersResponseSchema` instead.

- [ ] **Step 6: Run tests + typecheck**

Run: `pnpm --filter @omnicraft/api-schema test && pnpm --filter @omnicraft/backend test -- mcp && pnpm --filter @omnicraft/backend typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/api-schema/src/mcp packages/api-schema/src/index.ts apps/backend/src/dispatcher/mcp apps/backend/src/dispatcher/index.ts
git commit -m "feat(backend): GET /api/mcp/servers status API + reconnect"
```

---

### Task 10: Repo-wide verification

**Files:** none (verification only)

- [ ] **Step 1: Full lint/typecheck/test across the workspace**

Run: `pnpm lint:all && pnpm typecheck:all && pnpm -r test`
Expected: PASS across all packages. (Root aggregate scripts per the repo's `:all` convention.)

- [ ] **Step 2: Smoke-test a real MCP server (manual)**

Start the dev server (`pnpm dev` from repo root), add a real stdio MCP server to `settings.json` under `mcp.servers` with `enabledByAgent.chat` including it, then `GET /api/mcp/servers` and confirm `status: connected` with a non-empty `tools` list. Send a chat message that should trigger one of the MCP tools and confirm the `tool-execute-start`/`tool-execute-end` SSE events carry the `mcp__<server>__<tool>` name.

- [ ] **Step 3: Confirm no regressions in existing tool behavior**

Run: `pnpm --filter @omnicraft/backend test`
Expected: PASS — all pre-existing tool/agent tests still green.

---

## Notes for the implementer

- **The SDK API is the only uncertain surface.** Everything routes through the `McpClient` interface and `create-mcp-client.ts`. If `@modelcontextprotocol/sdk` names differ from Task 6 Step 3, fix only that file.
- **Availability is best-effort:** MCP tools appear on the next user message after a server connects (the tool set is snapshotted once per message in `AgentTurnRunner.run()`). This is intended (spec).
- **Consent is YOLO this round** — MCP tools run without approval (follow-up #360). Boot-time status UI is #361; the frontend settings UX is #362.
