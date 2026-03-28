# Agentic Framework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a generic agentic framework supporting Tool registration/execution, Skill registration/injection, and an autonomous Agent Loop.

**Architecture:** Abstract `Agent` base class with full loop logic, `ToolRegistry`/`SkillRegistry` abstract singletons for categorized registration, `ToolDefinition` with Zod parameters, `SkillDefinition` with lazy file loading, and `load_skill` as a built-in core tool. A new `@omnicraft/markdown-frontmatter` package handles YAML frontmatter parsing.

**Tech Stack:** TypeScript, Zod (parameters + validation + JSON Schema), `yaml` (YAML parsing), Koa (HTTP), Vitest (testing)

**Spec:** `docs/specs/2026-03-28-agentic-framework-design.md`

---

## File Structure

### New Package: `packages/markdown-frontmatter/`

| File                                                          | Responsibility                                           |
| ------------------------------------------------------------- | -------------------------------------------------------- |
| `packages/markdown-frontmatter/package.json`                  | Package manifest, depends on `yaml`                      |
| `packages/markdown-frontmatter/tsconfig.json`                 | TypeScript config extending `@config/typescript/package` |
| `packages/markdown-frontmatter/eslint.config.js`              | ESLint config                                            |
| `packages/markdown-frontmatter/src/index.ts`                  | Public exports                                           |
| `packages/markdown-frontmatter/src/parse-frontmatter.ts`      | `parseFrontmatter<T>()` implementation                   |
| `packages/markdown-frontmatter/src/parse-frontmatter.test.ts` | Tests                                                    |

### New Backend Files: `apps/backend/src/tools/`

| File                              | Responsibility                                      |
| --------------------------------- | --------------------------------------------------- |
| `src/tools/types.ts`              | `ToolDefinition`, `ToolExecutionContext` interfaces |
| `src/tools/tool-registry.ts`      | `ToolRegistry` abstract base class                  |
| `src/tools/tool-registry.test.ts` | ToolRegistry tests                                  |
| `src/tools/core-tool-registry.ts` | `CoreToolRegistry` singleton subclass               |
| `src/tools/load-skill.ts`         | Built-in `load_skill` tool singleton                |
| `src/tools/load-skill.test.ts`    | load_skill tests                                    |
| `src/tools/index.ts`              | Public exports                                      |

### New Backend Files: `apps/backend/src/skills/`

| File                                | Responsibility                                          |
| ----------------------------------- | ------------------------------------------------------- |
| `src/skills/types.ts`               | `SkillDefinition` class                                 |
| `src/skills/skill-registry.ts`      | `SkillRegistry` abstract base class with `loadFromFile` |
| `src/skills/skill-registry.test.ts` | SkillRegistry tests                                     |
| `src/skills/core-skill-registry.ts` | `CoreSkillRegistry` singleton subclass                  |
| `src/skills/loaders.ts`             | `loadSkillsFromDirectory()` discovery function          |
| `src/skills/loaders.test.ts`        | Loader tests                                            |
| `src/skills/index.ts`               | Public exports                                          |

### New Backend Files: `apps/backend/src/agents/core-agent/`

| File                                  | Responsibility       |
| ------------------------------------- | -------------------- |
| `src/agents/core-agent/core-agent.ts` | `CoreAgent` subclass |
| `src/agents/core-agent/index.ts`      | Public exports       |

### New Settings Schema

| File                                           | Responsibility            |
| ---------------------------------------------- | ------------------------- |
| `packages/settings-schema/src/agent/schema.ts` | Agent settings Zod schema |

### Modified Files

| File                                                 | Change                                                                         |
| ---------------------------------------------------- | ------------------------------------------------------------------------------ |
| `packages/settings-schema/src/schema.ts`             | Compose agent settings section                                                 |
| `packages/sse-events/src/schema.ts`                  | Remove `tool-call`, add `tool-execute-start`/`tool-execute-end`, modify `done` |
| `packages/sse-events/src/index.ts`                   | Update exports                                                                 |
| `apps/backend/src/api/llm/types.ts`                  | Add `tools` field to `LlmCompletionOptions`                                    |
| `apps/backend/src/api/llm/claude-adapter.ts`         | Convert `ToolDefinition` to Claude format                                      |
| `apps/backend/src/api/llm/openai-adapter.ts`         | Convert `ToolDefinition` to OpenAI format                                      |
| `apps/backend/src/api/llm/llm-api.ts`                | Pass through tools                                                             |
| `apps/backend/src/api/llm/index.ts`                  | Export new types                                                               |
| `apps/backend/src/models/llm-session/llm-session.ts` | Accept tools per call                                                          |
| `apps/backend/src/models/llm-session/types.ts`       | Add tool-execute events to session event types                                 |
| `apps/backend/src/models/llm-session/index.ts`       | Update exports                                                                 |
| `apps/backend/src/agents/types.ts`                   | Rewrite `Agent` as abstract base with full loop                                |
| `apps/backend/src/agents/index.ts`                   | Update exports                                                                 |
| `apps/backend/src/events/event-bus.ts`               | Add registry events if needed                                                  |
| `apps/backend/src/services/chat/chat-service.ts`     | Use `CoreAgent`                                                                |
| `apps/backend/src/startup/init-services.ts`          | Initialize registries                                                          |
| `apps/backend/src/dispatcher/chat/helpers/sse.ts`    | Update for new event types                                                     |

### Deleted Files

| File                                      | Reason                  |
| ----------------------------------------- | ----------------------- |
| `src/agents/simple-agent/simple-agent.ts` | Replaced by `CoreAgent` |
| `src/agents/simple-agent/index.ts`        | Replaced by `CoreAgent` |

---

## Tasks

### Task 1: `@omnicraft/markdown-frontmatter` Package

**Files:**

- Create: `packages/markdown-frontmatter/package.json`
- Create: `packages/markdown-frontmatter/tsconfig.json`
- Create: `packages/markdown-frontmatter/eslint.config.js`
- Create: `packages/markdown-frontmatter/src/index.ts`
- Create: `packages/markdown-frontmatter/src/parse-frontmatter.ts`
- Create: `packages/markdown-frontmatter/src/parse-frontmatter.test.ts`

- [ ] **Step 1: Create package scaffolding**

`packages/markdown-frontmatter/package.json`:

```json
{
  "name": "@omnicraft/markdown-frontmatter",
  "description": "YAML frontmatter parser for Markdown files",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "yaml": "^2.8.2"
  },
  "devDependencies": {
    "@config/eslint": "workspace:^",
    "@config/typescript": "workspace:^",
    "typescript": "catalog:",
    "vitest": "^4.1.0"
  }
}
```

`packages/markdown-frontmatter/tsconfig.json`:

```json
{
  "extends": "@config/typescript/package",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist"
  }
}
```

`packages/markdown-frontmatter/eslint.config.js`:

```javascript
import config from '@config/eslint';

export default config;
```

- [ ] **Step 2: Install dependencies**

Run: `bun install`

- [ ] **Step 3: Write the failing tests**

`packages/markdown-frontmatter/src/parse-frontmatter.test.ts`:

```typescript
import {describe, expect, it} from 'vitest';

import {parseFrontmatter} from './parse-frontmatter.js';

describe('parseFrontmatter', () => {
  it('parses valid frontmatter and body', () => {
    const input = `---
name: code-review
description: Guide for reviewing code
---

# Code Review

Follow these steps...`;

    const result = parseFrontmatter<{name: string; description: string}>(input);
    expect(result.attributes).toEqual({
      name: 'code-review',
      description: 'Guide for reviewing code',
    });
    expect(result.body).toBe('\n# Code Review\n\nFollow these steps...');
  });

  it('returns empty attributes and full body when no frontmatter is present', () => {
    const input = '# Just a heading\n\nSome content.';
    const result = parseFrontmatter(input);
    expect(result.attributes).toEqual({});
    expect(result.body).toBe(input);
  });

  it('returns empty attributes when file starts with --- but has no closing ---', () => {
    const input = '---\nname: test\nSome content without closing delimiter.';
    const result = parseFrontmatter(input);
    expect(result.attributes).toEqual({});
    expect(result.body).toBe(input);
  });

  it('handles empty frontmatter block', () => {
    const input = '---\n---\n\nBody content.';
    const result = parseFrontmatter(input);
    expect(result.attributes).toEqual({});
    expect(result.body).toBe('\nBody content.');
  });

  it('handles empty body', () => {
    const input = '---\nname: test\n---';
    const result = parseFrontmatter<{name: string}>(input);
    expect(result.attributes).toEqual({name: 'test'});
    expect(result.body).toBe('');
  });

  it('handles frontmatter with various YAML types', () => {
    const input = `---
title: My Post
count: 42
enabled: true
tags:
  - a
  - b
---
Body`;

    const result = parseFrontmatter<{
      title: string;
      count: number;
      enabled: boolean;
      tags: string[];
    }>(input);

    expect(result.attributes).toEqual({
      title: 'My Post',
      count: 42,
      enabled: true,
      tags: ['a', 'b'],
    });
    expect(result.body).toBe('Body');
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd packages/markdown-frontmatter && bun run test`
Expected: FAIL — module `./parse-frontmatter.js` not found

- [ ] **Step 5: Implement parseFrontmatter**

`packages/markdown-frontmatter/src/parse-frontmatter.ts`:

```typescript
import {parse as parseYaml} from 'yaml';

/** Result of parsing a Markdown file with YAML frontmatter. */
export interface FrontmatterResult<T> {
  /** Parsed YAML frontmatter as an object. */
  readonly attributes: T;
  /** Markdown body after the frontmatter block. */
  readonly body: string;
}

const DELIMITER = '---';

/**
 * Parses a Markdown string with YAML frontmatter.
 *
 * Expects the input to start with `---\n`. Everything between the first
 * and second `---\n` is parsed as YAML. The remainder is returned as `body`.
 *
 * If no valid frontmatter block is found, `attributes` is an empty object
 * and `body` is the entire input.
 */
export function parseFrontmatter<T = Record<string, unknown>>(
  markdown: string,
): FrontmatterResult<T> {
  if (!markdown.startsWith(`${DELIMITER}\n`)) {
    return {attributes: {} as T, body: markdown};
  }

  const endIndex = markdown.indexOf(`\n${DELIMITER}`, DELIMITER.length);
  if (endIndex === -1) {
    return {attributes: {} as T, body: markdown};
  }

  const yamlString = markdown.slice(DELIMITER.length + 1, endIndex);
  const body = markdown.slice(endIndex + DELIMITER.length + 1);

  const parsed: unknown = parseYaml(yamlString);
  const attributes = (
    parsed !== null && typeof parsed === 'object' ? parsed : {}
  ) as T;

  return {attributes, body};
}
```

`packages/markdown-frontmatter/src/index.ts`:

```typescript
export type {FrontmatterResult} from './parse-frontmatter.js';
export {parseFrontmatter} from './parse-frontmatter.js';
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd packages/markdown-frontmatter && bun run test`
Expected: All 6 tests PASS

- [ ] **Step 7: Run typecheck**

Run: `cd packages/markdown-frontmatter && bun run typecheck`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add packages/markdown-frontmatter/
git commit -m "feat: add @omnicraft/markdown-frontmatter package"
```

---

### Task 2: Agent Settings Schema

**Files:**

- Create: `packages/settings-schema/src/agent/schema.ts`
- Modify: `packages/settings-schema/src/schema.ts`

- [ ] **Step 1: Write the agent settings schema**

`packages/settings-schema/src/agent/schema.ts`:

```typescript
import {z} from 'zod';

export const agentSettingsSchema = z.object({
  maxToolRounds: z
    .number()
    .int()
    .min(1)
    .describe('Maximum tool call rounds per user message')
    .default(20),
});
```

- [ ] **Step 2: Compose into root schema**

Modify `packages/settings-schema/src/schema.ts`:

```typescript
import {z} from 'zod';

import {agentSettingsSchema} from './agent/schema.js';
import {llmSettingsSchema} from './llm/schema.js';

export const settingsSchema = z.object({
  llm: llmSettingsSchema.prefault({}),
  agent: agentSettingsSchema.prefault({}),
});

export type Settings = z.infer<typeof settingsSchema>;
```

- [ ] **Step 3: Run existing settings tests to verify nothing breaks**

Run: `cd packages/settings-schema && bun run test`
Expected: All existing tests PASS

- [ ] **Step 4: Run typecheck**

Run: `cd packages/settings-schema && bun run typecheck`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add packages/settings-schema/src/agent/schema.ts packages/settings-schema/src/schema.ts
git commit -m "feat(settings): add agent.maxToolRounds setting"
```

---

### Task 3: SSE Event Schema Updates

**Files:**

- Modify: `packages/sse-events/src/schema.ts`
- Modify: `packages/sse-events/src/index.ts`

- [ ] **Step 1: Update SSE event schemas**

Replace the entire content of `packages/sse-events/src/schema.ts`:

```typescript
import {z} from 'zod';

/** A text content delta from the LLM. */
export const sseTextDeltaEventSchema = z.object({
  type: z.literal('text-delta'),
  content: z.string(),
});
export type SseTextDeltaEvent = z.infer<typeof sseTextDeltaEventSchema>;

/** A tool has started executing. */
export const sseToolExecuteStartEventSchema = z.object({
  type: z.literal('tool-execute-start'),
  callId: z.string(),
  toolName: z.string(),
  arguments: z.string(),
});
export type SseToolExecuteStartEvent = z.infer<
  typeof sseToolExecuteStartEventSchema
>;

/** A tool has finished executing. */
export const sseToolExecuteEndEventSchema = z.object({
  type: z.literal('tool-execute-end'),
  callId: z.string(),
  result: z.string(),
  isError: z.boolean(),
});
export type SseToolExecuteEndEvent = z.infer<
  typeof sseToolExecuteEndEventSchema
>;

/** Stream completed successfully. */
export const sseDoneEventSchema = z.object({
  type: z.literal('done'),
  reason: z.enum(['complete', 'max_rounds_reached']),
});
export type SseDoneEvent = z.infer<typeof sseDoneEventSchema>;

/** An error occurred during streaming. */
export const sseErrorEventSchema = z.object({
  type: z.literal('error'),
  message: z.string(),
});
export type SseErrorEvent = z.infer<typeof sseErrorEventSchema>;

/** Validates known SSE event types. Unknown types fail validation. */
export const sseEventSchema = z.discriminatedUnion('type', [
  sseTextDeltaEventSchema,
  sseToolExecuteStartEventSchema,
  sseToolExecuteEndEventSchema,
  sseDoneEventSchema,
  sseErrorEventSchema,
]);

/** Union of all known SSE events. */
export type SseEvent = z.infer<typeof sseEventSchema>;
```

- [ ] **Step 2: Update exports**

Replace the entire content of `packages/sse-events/src/index.ts`:

```typescript
export type {
  SseDoneEvent,
  SseErrorEvent,
  SseEvent,
  SseTextDeltaEvent,
  SseToolExecuteEndEvent,
  SseToolExecuteStartEvent,
} from './schema.js';
export {
  sseDoneEventSchema,
  sseErrorEventSchema,
  sseEventSchema,
  sseTextDeltaEventSchema,
  sseToolExecuteEndEventSchema,
  sseToolExecuteStartEventSchema,
} from './schema.js';
```

- [ ] **Step 3: Run typecheck**

Run: `cd packages/sse-events && bun run typecheck`
Expected: No errors

- [ ] **Step 4: Fix downstream compilation errors in backend**

The `done` event in `apps/backend/src/dispatcher/chat/helpers/sse.ts` now requires a `reason` field. Update the `pumpEventStream` function:

In `apps/backend/src/dispatcher/chat/helpers/sse.ts`, change the done event construction (line 30):

```typescript
const done: SseDoneEvent = {type: 'done', reason: 'complete'};
```

Also remove the `SseToolCallEvent` import from any file that references it (the type no longer exists).

- [ ] **Step 5: Run backend typecheck to verify**

Run: `cd apps/backend && bun run typecheck`
Expected: May have additional errors from removed `tool-call` in LlmSession types — these will be addressed in later tasks. Note errors for now.

- [ ] **Step 6: Commit**

```bash
git add packages/sse-events/ apps/backend/src/dispatcher/chat/helpers/sse.ts
git commit -m "feat(sse-events): replace tool-call with tool-execute-start/end, add done reason"
```

---

### Task 4: ToolDefinition and ToolExecutionContext Types

**Files:**

- Create: `apps/backend/src/tools/types.ts`
- Create: `apps/backend/src/tools/index.ts`

- [ ] **Step 1: Create tool types**

`apps/backend/src/tools/types.ts`:

```typescript
import type {z} from 'zod';

import type {SkillDefinition} from '@/skills/types.js';

/** Execution context provided by the Agent to each Tool at call time. */
export interface ToolExecutionContext {
  /** All skills available to the current Agent, merged and deduplicated. */
  readonly availableSkills: SkillDefinition[];
}

/**
 * A stateless, singleton tool definition.
 *
 * - `parameters`: Zod schema used for type inference, runtime validation,
 *   and JSON Schema generation for LLM APIs.
 * - `execute`: Receives validated args from the LLM and execution context
 *   from the Agent. Returns a text result.
 */
export interface ToolDefinition<T extends z.ZodType = z.ZodType> {
  readonly name: string;
  readonly description: string;
  readonly parameters: T;
  execute(args: z.infer<T>, context: ToolExecutionContext): Promise<string>;
}
```

`apps/backend/src/tools/index.ts`:

```typescript
export type {ToolDefinition, ToolExecutionContext} from './types.js';
```

- [ ] **Step 2: Run typecheck (expect failure — SkillDefinition not yet created)**

Run: `cd apps/backend && bun run typecheck`
Expected: FAIL — `@/skills/types.js` not found. This is expected and resolved in Task 6.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/tools/types.ts apps/backend/src/tools/index.ts
git commit -m "feat: add ToolDefinition and ToolExecutionContext types"
```

---

### Task 5: ToolRegistry Abstract Base Class

**Files:**

- Create: `apps/backend/src/tools/tool-registry.ts`
- Create: `apps/backend/src/tools/tool-registry.test.ts`
- Modify: `apps/backend/src/tools/index.ts`

- [ ] **Step 1: Write the failing tests**

`apps/backend/src/tools/tool-registry.test.ts`:

```typescript
import {describe, expect, it} from 'vitest';
import {z} from 'zod';

import type {ToolDefinition, ToolExecutionContext} from './types.js';

import {ToolRegistry} from './tool-registry.js';

/** Concrete subclass for testing (no singleton — instantiated directly). */
class TestToolRegistry extends ToolRegistry {
  static createForTest(): TestToolRegistry {
    return new TestToolRegistry();
  }
}

function createMockTool(name: string): ToolDefinition {
  return {
    name,
    description: `Mock tool: ${name}`,
    parameters: z.object({}),
    execute: async (_args: unknown, _context: ToolExecutionContext) => 'ok',
  };
}

describe('ToolRegistry', () => {
  it('registers and retrieves a tool by name', () => {
    const registry = TestToolRegistry.createForTest();
    const tool = createMockTool('test_tool');
    registry.register(tool);
    expect(registry.get('test_tool')).toBe(tool);
  });

  it('returns undefined for unknown tool name', () => {
    const registry = TestToolRegistry.createForTest();
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  it('returns all registered tools', () => {
    const registry = TestToolRegistry.createForTest();
    const tool1 = createMockTool('tool_1');
    const tool2 = createMockTool('tool_2');
    registry.register(tool1);
    registry.register(tool2);
    expect(registry.getAll()).toEqual([tool1, tool2]);
  });

  it('throws when registering duplicate name', () => {
    const registry = TestToolRegistry.createForTest();
    const tool = createMockTool('duplicate');
    registry.register(tool);
    const tool2 = createMockTool('duplicate');
    expect(() => registry.register(tool2)).toThrow(
      'Tool "duplicate" is already registered',
    );
  });

  it('allows registering the same instance twice (idempotent)', () => {
    const registry = TestToolRegistry.createForTest();
    const tool = createMockTool('same');
    registry.register(tool);
    registry.register(tool);
    expect(registry.getAll()).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/backend && bun run test src/tools/tool-registry.test.ts`
Expected: FAIL — `./tool-registry.js` not found

- [ ] **Step 3: Implement ToolRegistry**

`apps/backend/src/tools/tool-registry.ts`:

```typescript
import type {ToolDefinition} from './types.js';

/**
 * Abstract base class for tool registries.
 * Concrete subclasses are singletons that group tools by category.
 */
export abstract class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  /** Registers a tool. Throws if a different tool with the same name exists. */
  register(tool: ToolDefinition): void {
    const existing = this.tools.get(tool.name);
    if (existing) {
      if (existing === tool) return;
      throw new Error(`Tool "${tool.name}" is already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  /** Retrieves a tool by name, or undefined if not found. */
  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /** Returns all registered tools. */
  getAll(): ToolDefinition[] {
    return [...this.tools.values()];
  }
}
```

- [ ] **Step 4: Update exports**

Add to `apps/backend/src/tools/index.ts`:

```typescript
export type {ToolDefinition, ToolExecutionContext} from './types.js';
export {ToolRegistry} from './tool-registry.js';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/backend && bun run test src/tools/tool-registry.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/tools/
git commit -m "feat: add ToolRegistry abstract base class"
```

---

### Task 6: SkillDefinition Class

**Files:**

- Create: `apps/backend/src/skills/types.ts`
- Create: `apps/backend/src/skills/index.ts`

- [ ] **Step 1: Create SkillDefinition class**

`apps/backend/src/skills/types.ts`:

```typescript
import {readFile} from 'node:fs/promises';

import {parseFrontmatter} from '@omnicraft/markdown-frontmatter';

/** Metadata expected in a Skill file's YAML frontmatter. */
interface SkillFrontmatter {
  name: string;
  description: string;
}

/**
 * A skill definition loaded from a Markdown file.
 *
 * Holds only metadata (name, description) and the file path.
 * The full Markdown content is loaded lazily via `getContent()`.
 */
export class SkillDefinition {
  readonly name: string;
  readonly description: string;
  private readonly filePath: string;

  constructor(name: string, description: string, filePath: string) {
    this.name = name;
    this.description = description;
    this.filePath = filePath;
  }

  /**
   * Creates a SkillDefinition from a Markdown file path.
   * Reads only the frontmatter; the body is not retained.
   */
  static async fromFile(filePath: string): Promise<SkillDefinition> {
    const raw = await readFile(filePath, 'utf-8');
    const {attributes} = parseFrontmatter<Partial<SkillFrontmatter>>(raw);

    if (!attributes.name || !attributes.description) {
      throw new Error(
        `Skill file "${filePath}" is missing required frontmatter fields: name, description`,
      );
    }

    return new SkillDefinition(
      attributes.name,
      attributes.description,
      filePath,
    );
  }

  /** Lazily reads the Markdown file and returns the body (excluding frontmatter). */
  async getContent(): Promise<string> {
    const raw = await readFile(this.filePath, 'utf-8');
    const {body} = parseFrontmatter(raw);
    return body;
  }
}
```

`apps/backend/src/skills/index.ts`:

```typescript
export {SkillDefinition} from './types.js';
```

- [ ] **Step 2: Add @omnicraft/markdown-frontmatter as a backend dependency**

Run: `cd apps/backend && bun add @omnicraft/markdown-frontmatter@workspace:^`

- [ ] **Step 3: Run typecheck**

Run: `cd apps/backend && bun run typecheck`
Expected: Tool types should now resolve (SkillDefinition exists). There may be pre-existing errors from SSE changes — note but don't fix here.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/skills/types.ts apps/backend/src/skills/index.ts apps/backend/package.json
git commit -m "feat: add SkillDefinition class with lazy content loading"
```

---

### Task 7: SkillRegistry Abstract Base Class

**Files:**

- Create: `apps/backend/src/skills/skill-registry.ts`
- Create: `apps/backend/src/skills/skill-registry.test.ts`
- Modify: `apps/backend/src/skills/index.ts`

- [ ] **Step 1: Write the failing tests**

`apps/backend/src/skills/skill-registry.test.ts`:

```typescript
import {mkdir, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {SkillRegistry} from './skill-registry.js';

class TestSkillRegistry extends SkillRegistry {
  static createForTest(): TestSkillRegistry {
    return new TestSkillRegistry();
  }
}

describe('SkillRegistry', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(tmpdir(), `skill-registry-test-${Date.now()}`);
    await mkdir(tempDir, {recursive: true});
  });

  afterEach(async () => {
    await rm(tempDir, {recursive: true, force: true});
  });

  it('loads a skill from a valid markdown file', async () => {
    const filePath = path.join(tempDir, 'test-skill.md');
    await writeFile(
      filePath,
      '---\nname: test-skill\ndescription: A test skill\n---\n\n# Test\n\nBody content.',
    );

    const registry = TestSkillRegistry.createForTest();
    await registry.loadFromFile(filePath);

    const skill = registry.get('test-skill');
    expect(skill).toBeDefined();
    expect(skill!.name).toBe('test-skill');
    expect(skill!.description).toBe('A test skill');
  });

  it('returns undefined for unknown skill name', () => {
    const registry = TestSkillRegistry.createForTest();
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  it('returns all registered skills', async () => {
    const file1 = path.join(tempDir, 'skill-a.md');
    const file2 = path.join(tempDir, 'skill-b.md');
    await writeFile(
      file1,
      '---\nname: skill-a\ndescription: Skill A\n---\nBody A',
    );
    await writeFile(
      file2,
      '---\nname: skill-b\ndescription: Skill B\n---\nBody B',
    );

    const registry = TestSkillRegistry.createForTest();
    await registry.loadFromFile(file1);
    await registry.loadFromFile(file2);

    expect(registry.getAll()).toHaveLength(2);
  });

  it('returns summary list for system prompt', async () => {
    const filePath = path.join(tempDir, 'my-skill.md');
    await writeFile(
      filePath,
      '---\nname: my-skill\ndescription: Does something useful\n---\nContent.',
    );

    const registry = TestSkillRegistry.createForTest();
    await registry.loadFromFile(filePath);

    expect(registry.getSummaryList()).toEqual([
      {name: 'my-skill', description: 'Does something useful'},
    ]);
  });

  it('throws when loading a file with missing frontmatter fields', async () => {
    const filePath = path.join(tempDir, 'bad-skill.md');
    await writeFile(filePath, '---\nname: only-name\n---\nContent.');

    const registry = TestSkillRegistry.createForTest();
    await expect(registry.loadFromFile(filePath)).rejects.toThrow(
      'missing required frontmatter fields',
    );
  });

  it('throws when loading duplicate skill name from different file', async () => {
    const file1 = path.join(tempDir, 'skill-1.md');
    const file2 = path.join(tempDir, 'skill-2.md');
    await writeFile(file1, '---\nname: dupe\ndescription: First\n---\nBody');
    await writeFile(file2, '---\nname: dupe\ndescription: Second\n---\nBody');

    const registry = TestSkillRegistry.createForTest();
    await registry.loadFromFile(file1);
    await expect(registry.loadFromFile(file2)).rejects.toThrow(
      'Skill "dupe" is already registered',
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/backend && bun run test src/skills/skill-registry.test.ts`
Expected: FAIL — `./skill-registry.js` not found

- [ ] **Step 3: Implement SkillRegistry**

`apps/backend/src/skills/skill-registry.ts`:

```typescript
import {SkillDefinition} from './types.js';

/**
 * Abstract base class for skill registries.
 * Concrete subclasses are singletons that group skills by category.
 * Skills are loaded from Markdown files via `loadFromFile`.
 */
export abstract class SkillRegistry {
  private readonly skills = new Map<string, SkillDefinition>();

  /**
   * Loads a single Markdown file, parses its frontmatter,
   * and registers the resulting SkillDefinition.
   */
  async loadFromFile(filePath: string): Promise<void> {
    const skill = await SkillDefinition.fromFile(filePath);
    const existing = this.skills.get(skill.name);
    if (existing) {
      if (existing === skill) return;
      throw new Error(`Skill "${skill.name}" is already registered`);
    }
    this.skills.set(skill.name, skill);
  }

  /** Retrieves a skill by name, or undefined if not found. */
  get(name: string): SkillDefinition | undefined {
    return this.skills.get(name);
  }

  /** Returns all registered skills. */
  getAll(): SkillDefinition[] {
    return [...this.skills.values()];
  }

  /** Returns name + description pairs for the system prompt skill catalog. */
  getSummaryList(): Array<{name: string; description: string}> {
    return this.getAll().map((skill) => ({
      name: skill.name,
      description: skill.description,
    }));
  }
}
```

- [ ] **Step 4: Update exports**

`apps/backend/src/skills/index.ts`:

```typescript
export {SkillDefinition} from './types.js';
export {SkillRegistry} from './skill-registry.js';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/backend && bun run test src/skills/skill-registry.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/skills/
git commit -m "feat: add SkillRegistry abstract base class with loadFromFile"
```

---

### Task 8: Skill Directory Loader

**Files:**

- Create: `apps/backend/src/skills/loaders.ts`
- Create: `apps/backend/src/skills/loaders.test.ts`
- Modify: `apps/backend/src/skills/index.ts`

- [ ] **Step 1: Write the failing tests**

`apps/backend/src/skills/loaders.test.ts`:

```typescript
import {mkdir, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {SkillRegistry} from './skill-registry.js';
import {loadSkillsFromDirectory} from './loaders.js';

class TestSkillRegistry extends SkillRegistry {
  static createForTest(): TestSkillRegistry {
    return new TestSkillRegistry();
  }
}

describe('loadSkillsFromDirectory', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(tmpdir(), `skill-loaders-test-${Date.now()}`);
    await mkdir(tempDir, {recursive: true});
  });

  afterEach(async () => {
    await rm(tempDir, {recursive: true, force: true});
  });

  it('loads all .md files from a directory', async () => {
    await writeFile(
      path.join(tempDir, 'skill-a.md'),
      '---\nname: skill-a\ndescription: Skill A\n---\nBody A',
    );
    await writeFile(
      path.join(tempDir, 'skill-b.md'),
      '---\nname: skill-b\ndescription: Skill B\n---\nBody B',
    );
    await writeFile(path.join(tempDir, 'readme.txt'), 'Not a skill');

    const registry = TestSkillRegistry.createForTest();
    await loadSkillsFromDirectory(registry, tempDir);

    expect(registry.getAll()).toHaveLength(2);
    expect(registry.get('skill-a')).toBeDefined();
    expect(registry.get('skill-b')).toBeDefined();
  });

  it('handles empty directory', async () => {
    const registry = TestSkillRegistry.createForTest();
    await loadSkillsFromDirectory(registry, tempDir);
    expect(registry.getAll()).toHaveLength(0);
  });

  it('ignores non-.md files', async () => {
    await writeFile(path.join(tempDir, 'notes.txt'), 'Not a skill');
    await writeFile(path.join(tempDir, 'data.json'), '{}');

    const registry = TestSkillRegistry.createForTest();
    await loadSkillsFromDirectory(registry, tempDir);
    expect(registry.getAll()).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/backend && bun run test src/skills/loaders.test.ts`
Expected: FAIL — `./loaders.js` not found

- [ ] **Step 3: Implement loadSkillsFromDirectory**

`apps/backend/src/skills/loaders.ts`:

```typescript
import {readdir} from 'node:fs/promises';
import path from 'node:path';

import type {SkillRegistry} from './skill-registry.js';

/**
 * Scans a directory for `.md` files and loads each one into the registry.
 * Non-`.md` files are silently ignored. Does not recurse into subdirectories.
 */
export async function loadSkillsFromDirectory(
  registry: SkillRegistry,
  dirPath: string,
): Promise<void> {
  const entries = await readdir(dirPath, {withFileTypes: true});
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const filePath = path.join(dirPath, entry.name);
    await registry.loadFromFile(filePath);
  }
}
```

- [ ] **Step 4: Update exports**

`apps/backend/src/skills/index.ts`:

```typescript
export {SkillDefinition} from './types.js';
export {SkillRegistry} from './skill-registry.js';
export {loadSkillsFromDirectory} from './loaders.js';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/backend && bun run test src/skills/loaders.test.ts`
Expected: All 3 tests PASS

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/skills/
git commit -m "feat: add loadSkillsFromDirectory skill discovery function"
```

---

### Task 9: CoreToolRegistry and CoreSkillRegistry Singletons

**Files:**

- Create: `apps/backend/src/tools/core-tool-registry.ts`
- Create: `apps/backend/src/skills/core-skill-registry.ts`
- Modify: `apps/backend/src/tools/index.ts`
- Modify: `apps/backend/src/skills/index.ts`

- [ ] **Step 1: Create CoreToolRegistry**

`apps/backend/src/tools/core-tool-registry.ts`:

```typescript
import assert from 'node:assert';

import {ToolRegistry} from './tool-registry.js';

/** Registry for always-available core tools (e.g., load_skill). */
export class CoreToolRegistry extends ToolRegistry {
  private static instance: CoreToolRegistry | null = null;

  /** Returns the singleton instance. */
  static getInstance(): CoreToolRegistry {
    assert(
      CoreToolRegistry.instance !== null,
      'CoreToolRegistry is not initialized. Call CoreToolRegistry.create() first.',
    );
    return CoreToolRegistry.instance;
  }

  /** Creates the singleton instance. */
  static create(): CoreToolRegistry {
    assert(
      CoreToolRegistry.instance === null,
      'CoreToolRegistry is already initialized.',
    );
    const registry = new CoreToolRegistry();
    CoreToolRegistry.instance = registry;
    return registry;
  }

  /** Resets the singleton instance. Only for use in tests. */
  static resetInstance(): void {
    CoreToolRegistry.instance = null;
  }
}
```

- [ ] **Step 2: Create CoreSkillRegistry**

`apps/backend/src/skills/core-skill-registry.ts`:

```typescript
import assert from 'node:assert';

import {SkillRegistry} from './skill-registry.js';

/** Registry for core skills. */
export class CoreSkillRegistry extends SkillRegistry {
  private static instance: CoreSkillRegistry | null = null;

  /** Returns the singleton instance. */
  static getInstance(): CoreSkillRegistry {
    assert(
      CoreSkillRegistry.instance !== null,
      'CoreSkillRegistry is not initialized. Call CoreSkillRegistry.create() first.',
    );
    return CoreSkillRegistry.instance;
  }

  /** Creates the singleton instance. */
  static create(): CoreSkillRegistry {
    assert(
      CoreSkillRegistry.instance === null,
      'CoreSkillRegistry is already initialized.',
    );
    const registry = new CoreSkillRegistry();
    CoreSkillRegistry.instance = registry;
    return registry;
  }

  /** Resets the singleton instance. Only for use in tests. */
  static resetInstance(): void {
    CoreSkillRegistry.instance = null;
  }
}
```

- [ ] **Step 3: Update exports**

`apps/backend/src/tools/index.ts`:

```typescript
export type {ToolDefinition, ToolExecutionContext} from './types.js';
export {ToolRegistry} from './tool-registry.js';
export {CoreToolRegistry} from './core-tool-registry.js';
```

`apps/backend/src/skills/index.ts`:

```typescript
export {SkillDefinition} from './types.js';
export {SkillRegistry} from './skill-registry.js';
export {CoreSkillRegistry} from './core-skill-registry.js';
export {loadSkillsFromDirectory} from './loaders.js';
```

- [ ] **Step 4: Run typecheck**

Run: `cd apps/backend && bun run typecheck`
Expected: No new errors from these files.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/tools/ apps/backend/src/skills/
git commit -m "feat: add CoreToolRegistry and CoreSkillRegistry singletons"
```

---

### Task 10: load_skill Built-in Tool

**Files:**

- Create: `apps/backend/src/tools/load-skill.ts`
- Create: `apps/backend/src/tools/load-skill.test.ts`
- Modify: `apps/backend/src/tools/index.ts`

- [ ] **Step 1: Write the failing tests**

`apps/backend/src/tools/load-skill.test.ts`:

```typescript
import {mkdir, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {SkillDefinition} from '@/skills/types.js';

import {loadSkillTool} from './load-skill.js';

describe('loadSkillTool', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(tmpdir(), `load-skill-test-${Date.now()}`);
    await mkdir(tempDir, {recursive: true});
  });

  afterEach(async () => {
    await rm(tempDir, {recursive: true, force: true});
  });

  it('has the correct name and description', () => {
    expect(loadSkillTool.name).toBe('load_skill');
    expect(loadSkillTool.description).toBeTruthy();
  });

  it('returns skill content when skill is found', async () => {
    const filePath = path.join(tempDir, 'test-skill.md');
    await writeFile(
      filePath,
      '---\nname: test-skill\ndescription: A test\n---\n\n# Test Skill\n\nDo this.',
    );
    const skill = await SkillDefinition.fromFile(filePath);

    const result = await loadSkillTool.execute(
      {name: 'test-skill'},
      {availableSkills: [skill]},
    );

    expect(result).toContain('# Test Skill');
    expect(result).toContain('Do this.');
  });

  it('returns error message when skill is not found', async () => {
    const result = await loadSkillTool.execute(
      {name: 'nonexistent'},
      {availableSkills: []},
    );

    expect(result).toContain('not found');
    expect(result).toContain('nonexistent');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/backend && bun run test src/tools/load-skill.test.ts`
Expected: FAIL — `./load-skill.js` not found

- [ ] **Step 3: Implement load_skill tool**

`apps/backend/src/tools/load-skill.ts`:

```typescript
import {z} from 'zod';

import type {ToolDefinition, ToolExecutionContext} from './types.js';

const parameters = z.object({
  name: z.string().describe('Name of the skill to load'),
});

/** Built-in tool that loads a skill's full Markdown content into the conversation. */
export const loadSkillTool: ToolDefinition<typeof parameters> = {
  name: 'load_skill',
  description:
    'Loads the full content of a skill by name. Use this to access detailed instructions for a specific skill listed in the system prompt.',
  parameters,
  async execute(
    args: z.infer<typeof parameters>,
    context: ToolExecutionContext,
  ): Promise<string> {
    const skill = context.availableSkills.find((s) => s.name === args.name);
    if (!skill) {
      return `Error: Skill "${args.name}" not found. Available skills: ${context.availableSkills.map((s) => s.name).join(', ') || 'none'}`;
    }
    return skill.getContent();
  },
};
```

- [ ] **Step 4: Update exports**

`apps/backend/src/tools/index.ts`:

```typescript
export type {ToolDefinition, ToolExecutionContext} from './types.js';
export {ToolRegistry} from './tool-registry.js';
export {CoreToolRegistry} from './core-tool-registry.js';
export {loadSkillTool} from './load-skill.js';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/backend && bun run test src/tools/load-skill.test.ts`
Expected: All 3 tests PASS

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/tools/
git commit -m "feat: add load_skill built-in tool"
```

---

### Task 11: LLM API Layer — Add Tool Definitions Support

**Files:**

- Modify: `apps/backend/src/api/llm/types.ts`
- Modify: `apps/backend/src/api/llm/claude-adapter.ts`
- Modify: `apps/backend/src/api/llm/openai-adapter.ts`
- Modify: `apps/backend/src/api/llm/llm-api.ts`
- Modify: `apps/backend/src/api/llm/index.ts`

- [ ] **Step 1: Update LlmCompletionOptions**

In `apps/backend/src/api/llm/types.ts`, add import and update `LlmCompletionOptions` (line 99-104):

```typescript
import type {ToolDefinition} from '@/tools/types.js';
```

Add at the top of the file. Then change `LlmCompletionOptions`:

```typescript
/** Options for a streaming LLM completion request. */
export interface LlmCompletionOptions {
  readonly config: Readonly<LlmConfig>;
  readonly messages: readonly LlmMessage[];
  readonly systemPrompt?: string;
  readonly tools: readonly ToolDefinition[];
}
```

- [ ] **Step 2: Update Claude adapter**

In `apps/backend/src/api/llm/claude-adapter.ts`, add tool conversion. After the existing imports, add:

```typescript
import type Anthropic from '@anthropic-ai/sdk';
import {z} from 'zod';

import type {ToolDefinition} from '@/tools/types.js';
```

Add a tool conversion function before `streamClaude`:

```typescript
/** Converts a ToolDefinition to the Anthropic tool format. */
function toClaudeTool(tool: ToolDefinition): Anthropic.Tool {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: z.toJSONSchema(tool.parameters) as Anthropic.Tool.InputSchema,
  };
}
```

In the `streamClaude` function, update the `client.messages.stream` call to include tools:

```typescript
const claudeTools = options.tools.map(toClaudeTool);

const stream = client.messages.stream({
  model: config.model,
  max_tokens: 4096,
  system: systemPrompt,
  messages: messages.map(toSdkMessage),
  ...(claudeTools.length > 0 ? {tools: claudeTools} : {}),
});
```

- [ ] **Step 3: Update OpenAI adapter**

In `apps/backend/src/api/llm/openai-adapter.ts`, add tool conversion. Add import:

```typescript
import {z} from 'zod';

import type {ToolDefinition} from '@/tools/types.js';
```

Add conversion function before `streamOpenAI`:

```typescript
/** Converts a ToolDefinition to the OpenAI tool format. */
function toOpenAITool(tool: ToolDefinition): OpenAI.ChatCompletionTool {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: z.toJSONSchema(tool.parameters),
    },
  };
}
```

In the `streamOpenAI` function, update the `client.chat.completions.create` call:

```typescript
const openaiTools = options.tools.map(toOpenAITool);

const stream = await client.chat.completions.create({
  model: config.model,
  messages: sdkMessages,
  stream: true,
  stream_options: {include_usage: true},
  ...(openaiTools.length > 0 ? {tools: openaiTools} : {}),
});
```

- [ ] **Step 4: Update LLM API index exports**

In `apps/backend/src/api/llm/index.ts`, no new type exports needed — `ToolDefinition` is already exported from `@/tools/`.

- [ ] **Step 5: Run typecheck**

Run: `cd apps/backend && bun run typecheck`
Expected: Closer to clean. Note remaining errors for next tasks.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/api/llm/
git commit -m "feat(llm): add tool definitions support to adapters"
```

---

### Task 12: LlmSession — Accept Tools and SystemPrompt Per Call

**Files:**

- Modify: `apps/backend/src/models/llm-session/llm-session.ts`
- Modify: `apps/backend/src/models/llm-session/types.ts`
- Modify: `apps/backend/src/models/llm-session/index.ts`

- [ ] **Step 1: Update LlmSession event types**

In `apps/backend/src/models/llm-session/types.ts`, the existing `LlmSessionToolCallEvent` stays for internal use (the Agent loop needs to know about raw tool calls). No change needed here — the Agent layer will consume these and produce SSE events.

- [ ] **Step 2: Update LlmSession to accept tools and systemPrompt per call**

In `apps/backend/src/models/llm-session/llm-session.ts`:

Add import:

```typescript
import type {ToolDefinition} from '@/tools/types.js';
```

Remove `systemPrompt` from the constructor. It is now passed per call:

```typescript
  constructor(getConfig: () => Promise<LlmConfig>) {
    this.id = crypto.randomUUID();
    this.getConfig = getConfig;
    eventBus.emit('llm-session-created', this);
  }
```

Remove the `private readonly systemPrompt: string;` field.

Change `sendUserMessage` signature to accept tools and systemPrompt:

```typescript
  async *sendUserMessage(
    content: string,
    tools: readonly ToolDefinition[] = [],
    systemPrompt = '',
  ): LlmSessionEventStream {
    yield* this.sendMessages([{role: 'user', content}], tools, systemPrompt);
  }
```

Change `submitToolResults` signature to accept tools and systemPrompt:

```typescript
  async *submitToolResults(
    results: ToolResult[],
    tools: readonly ToolDefinition[] = [],
    systemPrompt = '',
  ): LlmSessionEventStream {
    const toolMessages: LlmMessage[] = results.map((result) => ({
      role: 'tool' as const,
      callId: result.callId,
      content: result.content,
    }));
    yield* this.sendMessages(toolMessages, tools, systemPrompt);
  }
```

Change `sendMessages` to pass tools and systemPrompt:

```typescript
  private async *sendMessages(
    messages: LlmMessage[],
    tools: readonly ToolDefinition[],
    systemPrompt: string,
  ): LlmSessionEventStream {
    const release = await this.mutex.acquire();
    const rollbackIndex = this.messages.length;
    this.messages.push(...messages);
    let completed = false;
    try {
      yield* this.streamCompletion(tools, systemPrompt);
      completed = true;
    } finally {
      if (!completed) {
        this.messages.length = rollbackIndex;
      }
      release();
    }
  }
```

Change `streamCompletion` to accept and pass tools and systemPrompt:

```typescript
  private async *streamCompletion(
    tools: readonly ToolDefinition[],
    systemPrompt: string,
  ): LlmSessionEventStream {
    const llmConfig = await this.getConfig();
    const eventStream = llmApi.streamCompletion({
      config: llmConfig,
      messages: this.messages,
      systemPrompt: systemPrompt || undefined,
      tools,
    });
    // ... rest unchanged
  }
```

- [ ] **Step 3: Run typecheck**

Run: `cd apps/backend && bun run typecheck`
Expected: Getting closer to clean.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/models/llm-session/
git commit -m "feat(llm-session): accept tool definitions and systemPrompt per call"
```

---

### Task 13: Agent Base Class Rewrite

**Files:**

- Modify: `apps/backend/src/agents/types.ts`

- [ ] **Step 1: Rewrite Agent base class**

Replace the entire content of `apps/backend/src/agents/types.ts`:

```typescript
import crypto from 'node:crypto';

import type {LlmConfig} from '@/api/llm/index.js';
import {eventBus} from '@/events/index.js';
import type {LlmSessionEvent} from '@/models/llm-session/index.js';
import {LlmSession} from '@/models/llm-session/index.js';
import {LlmSessionStore} from '@/models/llm-session-store/index.js';
import type {SkillDefinition} from '@/skills/index.js';
import {SkillRegistry} from '@/skills/index.js';
import type {ToolDefinition, ToolExecutionContext} from '@/tools/index.js';
import {loadSkillTool} from '@/tools/index.js';
import {ToolRegistry} from '@/tools/index.js';
import {settingsService} from '@/services/settings/index.js';

/**
 * Events yielded by the Agent during message handling.
 * Includes LLM session events plus tool execution lifecycle events.
 */
export interface AgentToolExecuteStartEvent {
  type: 'tool-execute-start';
  callId: string;
  toolName: string;
  arguments: string;
}

export interface AgentToolExecuteEndEvent {
  type: 'tool-execute-end';
  callId: string;
  result: string;
  isError: boolean;
}

export interface AgentDoneEvent {
  type: 'done';
  reason: 'complete' | 'max_rounds_reached';
}

export type AgentEvent =
  | LlmSessionEvent
  | AgentToolExecuteStartEvent
  | AgentToolExecuteEndEvent
  | AgentDoneEvent;

/** An async generator that yields agent streaming events. */
export type AgentEventStream = AsyncGenerator<AgentEvent, void, undefined>;

/**
 * Abstract base class for all agents.
 *
 * Contains the full Agent Loop: LLM call → tool execution → result
 * submission → repeat. Subclasses only differ in what they pass to
 * `super()` (which registries, which base system prompt).
 *
 * Abstract solely to prevent direct instantiation — no abstract methods.
 */
export abstract class Agent {
  readonly id: string;
  readonly llmSessionId: string;

  private cachedLlmSession: LlmSession | null = null;
  private readonly toolRegistries: ToolRegistry[];
  private readonly skillRegistries: SkillRegistry[];
  private readonly baseSystemPrompt: string;

  constructor(
    getConfig: () => Promise<LlmConfig>,
    options: {
      toolRegistries: ToolRegistry[];
      skillRegistries: SkillRegistry[];
      baseSystemPrompt: string;
    },
  ) {
    this.id = crypto.randomUUID();
    this.toolRegistries = options.toolRegistries;
    this.skillRegistries = options.skillRegistries;
    this.baseSystemPrompt = options.baseSystemPrompt;

    const llmSession = new LlmSession(getConfig);
    this.llmSessionId = llmSession.id;
    eventBus.emit('agent-created', this);
  }

  async *handleUserMessage(userMessage: string): AgentEventStream {
    const settings = await settingsService.getAll();
    const maxRounds = settings.agent.maxToolRounds;
    let round = 0;

    const llmSession = this.getLlmSession();
    const tools = this.getAvailableTools();
    const systemPrompt = this.buildSystemPrompt();

    // First round: send user message
    let pendingToolCalls = yield* this.consumeStream(
      llmSession.sendUserMessage(userMessage, tools, systemPrompt),
    );

    while (pendingToolCalls.length > 0 && round < maxRounds) {
      const results = await this.executeToolCalls(pendingToolCalls, tools);

      // Submit results and get next round
      const currentTools = this.getAvailableTools();
      const currentSystemPrompt = this.buildSystemPrompt();
      pendingToolCalls = yield* this.consumeStream(
        llmSession.submitToolResults(
          results,
          currentTools,
          currentSystemPrompt,
        ),
      );
      round++;
    }

    if (round >= maxRounds && pendingToolCalls.length > 0) {
      yield {type: 'done', reason: 'max_rounds_reached'};
    } else {
      yield {type: 'done', reason: 'complete'};
    }
  }

  /** Merges all tool registries + load_skill, deduplicated by reference. */
  private getAvailableTools(): ToolDefinition[] {
    const seen = new Map<string, ToolDefinition>();

    for (const registry of this.toolRegistries) {
      for (const tool of registry.getAll()) {
        const existing = seen.get(tool.name);
        if (existing) {
          if (existing !== tool) {
            throw new Error(
              `Tool name collision: "${tool.name}" exists as different instances`,
            );
          }
          continue;
        }
        seen.set(tool.name, tool);
      }
    }

    // Add load_skill if not already present and there are skills
    const availableSkills = this.getAvailableSkills();
    if (availableSkills.length > 0 && !seen.has(loadSkillTool.name)) {
      seen.set(loadSkillTool.name, loadSkillTool);
    }

    return [...seen.values()];
  }

  /** Merges all skill registries, deduplicated by reference. */
  private getAvailableSkills(): SkillDefinition[] {
    const seen = new Map<string, SkillDefinition>();

    for (const registry of this.skillRegistries) {
      for (const skill of registry.getAll()) {
        const existing = seen.get(skill.name);
        if (existing) {
          if (existing !== skill) {
            throw new Error(
              `Skill name collision: "${skill.name}" exists as different instances`,
            );
          }
          continue;
        }
        seen.set(skill.name, skill);
      }
    }

    return [...seen.values()];
  }

  /** Assembles the full system prompt: base prompt + skill catalog. */
  private buildSystemPrompt(): string {
    const parts: string[] = [];

    if (this.baseSystemPrompt) {
      parts.push(this.baseSystemPrompt);
    }

    const summaries: Array<{name: string; description: string}> = [];
    for (const registry of this.skillRegistries) {
      summaries.push(...registry.getSummaryList());
    }

    if (summaries.length > 0) {
      const catalog = summaries
        .map((s) => `- ${s.name}: ${s.description}`)
        .join('\n');
      parts.push(
        `You have the following skills available.\nUse the load_skill tool to load the full content when needed:\n\n${catalog}`,
      );
    }

    return parts.join('\n\n');
  }

  /**
   * Consumes an LlmSession event stream, yielding text-delta events
   * and collecting tool calls. Returns the collected tool calls.
   */
  private async *consumeStream(
    stream: AsyncGenerator<LlmSessionEvent, void, undefined>,
  ): AsyncGenerator<
    AgentEvent,
    {callId: string; toolName: string; arguments: string}[],
    undefined
  > {
    const toolCalls: {callId: string; toolName: string; arguments: string}[] =
      [];

    for await (const event of stream) {
      if (event.type === 'text-delta') {
        yield event;
      } else if (event.type === 'tool-call') {
        toolCalls.push(event.toolCall);
      }
    }

    return toolCalls;
  }

  /**
   * Executes tool calls, yielding lifecycle events and collecting results.
   */
  private async executeToolCalls(
    toolCalls: {callId: string; toolName: string; arguments: string}[],
    tools: ToolDefinition[],
  ): Promise<{callId: string; content: string}[]> {
    const context: ToolExecutionContext = {
      availableSkills: this.getAvailableSkills(),
    };
    const results: {callId: string; content: string}[] = [];

    for (const toolCall of toolCalls) {
      const tool = tools.find((t) => t.name === toolCall.toolName);

      if (!tool) {
        results.push({
          callId: toolCall.callId,
          content: `Error: Unknown tool "${toolCall.toolName}"`,
        });
        continue;
      }

      try {
        const parsedArgs: unknown = tool.parameters.parse(
          JSON.parse(toolCall.arguments),
        );
        const result = await tool.execute(parsedArgs, context);
        results.push({callId: toolCall.callId, content: result});
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        results.push({callId: toolCall.callId, content: `Error: ${message}`});
      }
    }

    return results;
  }

  protected getLlmSession(): LlmSession {
    if (!this.cachedLlmSession) {
      const session = LlmSessionStore.getInstance().get(this.llmSessionId);
      if (!session) {
        throw new Error(`LLM session not found: ${this.llmSessionId}`);
      }
      this.cachedLlmSession = session;
    }
    return this.cachedLlmSession;
  }
}
```

Note: The `consumeStream` method uses a generator return value pattern. This is a complex implementation — the executing agent should verify that `yield*` properly returns the collected tool calls. If TypeScript has issues with the return type, an alternative approach is to separate the tool call collection:

```typescript
// Alternative: use a mutable array passed in
private async *consumeStreamInto(
  stream: AsyncGenerator<LlmSessionEvent, void, undefined>,
  toolCalls: {callId: string; toolName: string; arguments: string}[],
): AgentEventStream {
  for await (const event of stream) {
    if (event.type === 'text-delta') {
      yield event;
    } else if (event.type === 'tool-call') {
      toolCalls.push(event.toolCall);
    }
  }
}
```

And in `handleUserMessage`:

```typescript
const toolCalls: {callId: string; toolName: string; arguments: string}[] = [];
yield* this.consumeStreamInto(llmSession.sendUserMessage(...), toolCalls);
```

Use whichever approach compiles cleanly.

- [ ] **Step 2: Run typecheck**

Run: `cd apps/backend && bun run typecheck`
Expected: May have issues — fix any type errors.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/agents/types.ts
git commit -m "feat: rewrite Agent base class with full Agent Loop"
```

---

### Task 14: CoreAgent and Wiring

**Files:**

- Create: `apps/backend/src/agents/core-agent/core-agent.ts`
- Create: `apps/backend/src/agents/core-agent/index.ts`
- Delete: `apps/backend/src/agents/simple-agent/simple-agent.ts`
- Delete: `apps/backend/src/agents/simple-agent/index.ts`
- Modify: `apps/backend/src/agents/index.ts`
- Modify: `apps/backend/src/services/chat/chat-service.ts`
- Modify: `apps/backend/src/startup/init-services.ts`

- [ ] **Step 1: Create CoreAgent**

`apps/backend/src/agents/core-agent/core-agent.ts`:

```typescript
import type {LlmConfig} from '@/api/llm/index.js';
import {CoreSkillRegistry} from '@/skills/index.js';
import {CoreToolRegistry} from '@/tools/index.js';

import {Agent} from '../types.js';

/**
 * Default agent with core tools and skills.
 * Used as the standard agent type for chat sessions.
 */
export class CoreAgent extends Agent {
  constructor(getConfig: () => Promise<LlmConfig>) {
    super(getConfig, {
      toolRegistries: [CoreToolRegistry.getInstance()],
      skillRegistries: [CoreSkillRegistry.getInstance()],
      baseSystemPrompt: 'You are a helpful assistant.',
    });
  }
}
```

`apps/backend/src/agents/core-agent/index.ts`:

```typescript
export {CoreAgent} from './core-agent.js';
```

- [ ] **Step 2: Delete SimpleAgent**

```bash
rm apps/backend/src/agents/simple-agent/simple-agent.ts
rm apps/backend/src/agents/simple-agent/index.ts
rmdir apps/backend/src/agents/simple-agent
```

- [ ] **Step 3: Update agents index**

Replace `apps/backend/src/agents/index.ts`:

```typescript
export {CoreAgent} from './core-agent/index.js';
export type {AgentEvent, AgentEventStream} from './types.js';
export {Agent} from './types.js';
```

- [ ] **Step 4: Update ChatService**

In `apps/backend/src/services/chat/chat-service.ts`, replace `SimpleAgent` with `CoreAgent`:

```typescript
import type {AgentEventStream} from '@/agents/index.js';
import {CoreAgent} from '@/agents/index.js';
import type {LlmConfig} from '@/api/llm/index.js';
import {AgentStore} from '@/models/agent-store/index.js';
import {LlmSessionStore} from '@/models/llm-session-store/index.js';
import {settingsService} from '@/services/settings/index.js';

import type {CreateSessionResult} from './types.js';
import {CreateSessionError} from './types.js';

/** Returns the current LLM configuration from settings. */
async function getLlmConfig(): Promise<LlmConfig> {
  const settings = await settingsService.getAll();
  const {apiFormat, apiKey, baseUrl, model} = settings.llm;
  return {apiFormat, apiKey, baseUrl, model};
}

/** Service layer for chat operations. */
export const chatService = {
  async createSession(): Promise<CreateSessionResult> {
    const config = await getLlmConfig();

    if (!config.baseUrl) {
      return {
        success: false,
        error: CreateSessionError.BASE_URL_NOT_CONFIGURED,
      };
    }
    if (!config.model) {
      return {success: false, error: CreateSessionError.MODEL_NOT_CONFIGURED};
    }

    const agent = new CoreAgent(getLlmConfig);
    return {success: true, sessionId: agent.id};
  },

  streamCompletion(
    agentId: string,
    userMessage: string,
  ): AgentEventStream | undefined {
    const agent = AgentStore.getInstance().get(agentId);
    if (!agent) return undefined;
    return agent.handleUserMessage(userMessage);
  },

  deleteSession(agentId: string): void {
    const agentStore = AgentStore.getInstance();
    const agent = agentStore.get(agentId);
    if (agent) {
      LlmSessionStore.getInstance().delete(agent.llmSessionId);
      agentStore.delete(agentId);
    }
  },
};
```

- [ ] **Step 5: Update init-services.ts**

In `apps/backend/src/startup/init-services.ts`:

```typescript
import path from 'node:path';

import {getDataDir} from '@/helpers/env.js';
import {logger} from '@/logger.js';
import {AgentStore} from '@/models/agent-store/index.js';
import {LlmSessionStore} from '@/models/llm-session-store/index.js';
import {SettingsManager} from '@/models/settings-manager/index.js';
import {CoreSkillRegistry} from '@/skills/index.js';
import {CoreToolRegistry} from '@/tools/index.js';
import {loadSkillTool} from '@/tools/index.js';

/** Initializes all services that require async setup before the server starts. */
export async function initServices(): Promise<void> {
  await initSettingsManager();
  AgentStore.create();
  LlmSessionStore.create();
  initToolRegistries();
  await initSkillRegistries();
}

/** Initializes the SettingsManager singleton. */
async function initSettingsManager(): Promise<void> {
  const settingsPath = path.join(getDataDir(), 'settings.json');
  const {warnings} = await SettingsManager.create(settingsPath);
  for (const warning of warnings) {
    logger.warn({warning}, 'Settings initialization warning');
  }
}

/** Initializes tool registries and registers core tools. */
function initToolRegistries(): void {
  const coreTools = CoreToolRegistry.create();
  coreTools.register(loadSkillTool);
}

/** Initializes skill registries and loads skill files. */
async function initSkillRegistries(): Promise<void> {
  CoreSkillRegistry.create();
  // No skill files to load yet — framework only.
  // Future: loadSkillsFromDirectory(CoreSkillRegistry.getInstance(), skillsDir);
}
```

- [ ] **Step 6: Update SSE pump to handle new agent events**

In `apps/backend/src/dispatcher/chat/helpers/sse.ts`, the `pumpEventStream` function already handles unknown event types by passing them through `writeSseEvent` which validates against the SSE schema. The new `tool-execute-start`, `tool-execute-end`, and `done` events from the Agent need to pass schema validation.

However, the `done` event is now yielded by the Agent, not by `pumpEventStream`. Update `pumpEventStream` to not emit its own `done`:

```typescript
import {PassThrough} from 'node:stream';

import assert from 'node:assert';

import {sseEventSchema} from '@omnicraft/sse-events';

import {logger} from '@/logger.js';

/** Writes a single SSE event to the stream. Validates against the shared schema. */
export function writeSseEvent(stream: PassThrough, data: unknown): void {
  if (stream.destroyed || stream.writableEnded) return;
  const result = sseEventSchema.safeParse(data);
  assert(result.success, `Invalid SSE event: ${JSON.stringify(data)}`);
  stream.write(`data: ${JSON.stringify(result.data)}\n\n`);
}

/**
 * Consumes an async event stream and writes each event as SSE.
 * The stream is expected to yield its own `done` or `error` events.
 * If the generator throws, an `error` event is emitted.
 * Always ends the stream when finished.
 */
export async function pumpEventStream(
  stream: PassThrough,
  eventStream: AsyncGenerator<unknown, void, undefined>,
): Promise<void> {
  try {
    for await (const event of eventStream) {
      writeSseEvent(stream, event);
    }
  } catch (e) {
    logger.error({err: e}, 'SSE stream error');
    writeSseEvent(stream, {
      type: 'error',
      message: 'An internal error occurred',
    });
  } finally {
    if (!stream.destroyed && !stream.writableEnded) {
      stream.end();
    }
  }
}
```

- [ ] **Step 7: Run typecheck**

Run: `cd apps/backend && bun run typecheck`
Expected: Should be clean or very close.

- [ ] **Step 8: Run all backend tests**

Run: `cd apps/backend && bun run test`
Expected: All tests PASS. Some existing tests that reference `SimpleAgent` may need updating — fix any failures.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add CoreAgent, wire up registries and Agent Loop"
```

---

### Task 15: End-to-End Verification

**Files:**

- No new files — verification only.

- [ ] **Step 1: Run full typecheck across all packages**

Run from project root:

```bash
cd packages/markdown-frontmatter && bun run typecheck
cd ../settings-schema && bun run typecheck
cd ../sse-events && bun run typecheck
cd ../../apps/backend && bun run typecheck
```

Expected: All pass with no errors.

- [ ] **Step 2: Run all tests**

```bash
cd packages/markdown-frontmatter && bun run test
cd ../../apps/backend && bun run test
```

Expected: All tests pass.

- [ ] **Step 3: Run lint and format check**

Run from project root:

```bash
bunx eslint .
bunx prettier --check .
```

Expected: No errors. Fix any issues.

- [ ] **Step 4: Start the dev server and verify basic functionality**

```bash
cd apps/backend && bun run dev
```

In another terminal, test:

```bash
# Create a session
curl -X POST http://localhost:<PORT>/api/chat/session

# Send a message (use the returned sessionId)
curl -X POST http://localhost:<PORT>/api/chat/session/<id>/completions \
  -H 'Content-Type: application/json' \
  -d '{"message": "Hello"}'
```

Expected: SSE stream with `text-delta` events followed by a `done` event with `reason: "complete"`.

- [ ] **Step 5: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: resolve end-to-end verification issues"
```
