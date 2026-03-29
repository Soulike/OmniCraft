# Agentic Framework Design

## Overview

A generic agentic framework for OmniCraft backend, supporting Tool registration/execution and Skill registration/injection. The framework enables the Agent to autonomously loop through LLM calls and Tool executions until a final text response is produced.

**Scope:** Framework only. No built-in Tools or Skills are included. MCP integration is deferred but the design accommodates it.

## Concepts

| Concept           | Definition                                                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Tool**          | An atomic, stateless operation executed on the backend. Described by a Zod schema for parameters. Singleton.                               |
| **Skill**         | A Markdown file with frontmatter metadata. A prompt dynamically loaded into conversation context to guide LLM behavior. Singleton.         |
| **ToolRegistry**  | A singleton store for a group of Tools. Multiple registries provide categorization. Abstract base class, concrete subclasses per category. |
| **SkillRegistry** | A singleton store for a group of Skills. Loaded from Markdown files. Abstract base class, concrete subclasses per category.                |
| **Agent**         | Non-abstract class containing the full Agent Loop. Receives Tool/Skill registries, orchestrates LLM calls and Tool execution.              |
| **Agent Loop**    | Fully automatic: LLM call -> tool call -> execute -> submit result -> repeat, until LLM returns pure text or max rounds reached.           |

## Tool System

### ToolDefinition

Each Tool is a singleton, stateless object:

```typescript
interface ToolDefinition<T extends z.ZodType = z.ZodType> {
  readonly name: string;
  readonly description: string;
  readonly parameters: T;
  execute(args: z.infer<T>, context: ToolExecutionContext): Promise<string>;
}

interface ToolExecutionContext {
  readonly availableSkills: SkillDefinition[];
  // Extensible: future fields such as agentId, sessionId, etc.
}
```

- `parameters`: Zod schema. Provides three capabilities in one:
  - **Type inference** via `z.infer<T>` for `execute` argument type safety.
  - **Runtime validation** via `parameters.parse(args)` before execution.
  - **JSON Schema generation** via `z.toJSONSchema(parameters)` for LLM API calls.
- `execute`: Receives two arguments:
  - `args`: parsed/validated business parameters from the LLM.
  - `context`: execution environment provided by the Agent (available skills list, future extensible fields). The LLM is unaware of context; it only produces `args` based on the JSON Schema.
- Stateless: no session or conversation state held. Environment information comes from `context`, not instance state.

### ToolRegistry

Abstract base class, concrete subclasses are singletons following the project's existing pattern (`create()` / `getInstance()` / `resetInstance()`):

```typescript
abstract class ToolRegistry {
  register(tool: ToolDefinition): void;
  get(name: string): ToolDefinition | undefined;
  getAll(): ToolDefinition[];
}
```

- `register()` validates name uniqueness within this registry.
- Concrete subclasses per category, e.g.:
  - `CoreToolRegistry` — always-available tools (includes `load_skill`).
  - Future: `CodingToolRegistry`, `WebToolRegistry`, etc.
  - Future: MCP tools naturally become their own registry subclass.

### Tool Deduplication

Tools are singletons. When Agent merges multiple registries:

- Same name, same instance reference (`===`) -> deduplicate, keep one copy.
- Same name, different instance -> implementation bug, throw error.

### LLM Adapter Integration

`LlmCompletionOptions` gains a `tools` field:

```typescript
interface LlmCompletionOptions {
  readonly config: Readonly<LlmConfig>;
  readonly messages: readonly LlmMessage[];
  readonly systemPrompt?: string;
  readonly tools: readonly ToolDefinition[];
}
```

Each adapter (Claude / OpenAI) converts `ToolDefinition` to its own API format internally:

- **Claude**: `Anthropic.Tool[]` — `name`, `description`, `input_schema` (JSON Schema from Zod).
- **OpenAI**: `ChatCompletionTool[]` — `type: "function"`, `function.name`, `function.parameters`.

Upper layers are unaware of format differences.

## Skill System

### SkillDefinition

A pure data object, singleton, no execution logic:

A class with lazy content loading:

```typescript
class SkillDefinition {
  readonly name: string;
  readonly description: string;
  private readonly filePath: string;

  constructor(name: string, description: string, filePath: string);

  /** Lazily reads the Markdown file and returns the body (excluding frontmatter). */
  async getContent(): Promise<string>;
}
```

- `name`: unique identifier, e.g. `"code-review"`.
- `description`: one-line summary for the system prompt skill catalog.
- `filePath`: private. The content source is an internal detail; callers use `getContent()`.
- `getContent()`: reads the file at `filePath`, strips frontmatter, returns the Markdown body. Called on demand when `load_skill` is invoked.

### Skill File Format

Each Skill is a Markdown file with YAML frontmatter:

```markdown
---
name: code-review
description: Guide for reviewing code quality and best practices
---

# Code Review

When reviewing code, follow these steps...
```

Frontmatter parsing is handled by a new shared package `@omnicraft/markdown-frontmatter`. See the **New Packages** section for details.

### SkillRegistry

Abstract base class, concrete subclasses are singletons:

```typescript
abstract class SkillRegistry {
  async loadFromFile(filePath: string): Promise<void>;
  get(name: string): SkillDefinition | undefined;
  getAll(): SkillDefinition[];
  getSummaryList(): Array<{name: string; description: string}>;
}
```

- `loadFromFile(filePath)`: reads a single `.md` file, parses frontmatter to extract `name` and `description`, registers a `SkillDefinition` with the `filePath`. The Markdown body is **not** read into memory — it is loaded lazily when `load_skill` is called.
- `getSummaryList()`: returns name + description pairs for the system prompt catalog.
- No public `register()` — all registration goes through `loadFromFile`.

### Skill Discovery

Discovery strategies are separate functions that call `loadFromFile` internally:

```typescript
// Our own directory structure: data/skills/core/*.md
async function loadSkillsFromDirectory(
  registry: SkillRegistry,
  dirPath: string,
): Promise<void>;

// Future: Claude Code plugin structure
async function loadSkillsFromPlugin(
  registry: SkillRegistry,
  pluginPath: string,
): Promise<void>;
```

This separation means:

- `SkillRegistry` only knows how to parse and register a single file.
- Discovery logic (directory scanning, plugin format parsing) is pluggable.
- New directory structures only require a new discovery function.

### Skill Deduplication

Same rule as Tools: singletons, reference equality for dedup, throw on name collision with different instances.

### load_skill Tool

A global singleton Core Tool registered in `CoreToolRegistry`. Stateless like all other Tools — it accesses SkillRegistries through the `ToolExecutionContext` provided by the Agent at execution time.

- **Parameters**: `z.object({ name: z.string() })`
- **Execute**: looks up the skill by name from `context.availableSkills`, calls `skill.getContent()` to lazily load the Markdown body, and returns it as the tool result. Returns an error message if the skill is not found or the file cannot be read.

The skill's full Markdown content enters the conversation history as a tool result. No special system prompt modification is needed.

### System Prompt Skill Catalog

At each LLM call, Agent generates a skill catalog from all `SkillRegistry` instances and appends it to the system prompt:

```
You have the following skills available.
Use the load_skill tool to load the full content when needed:

- code-review: Guide for reviewing code quality and best practices
- debugging: Systematic debugging methodology
- tdd: Test-driven development workflow
```

## Agent

### Class Design

`Agent` is an abstract base class containing the full Agent Loop implementation. It has no abstract methods — subclasses only differ in what they pass to `super()`. `Agent` is abstract solely to prevent direct instantiation; all logic is in the base class.

`CoreAgent` is the first concrete subclass, used for testing and as the default agent type.

```typescript
abstract class Agent {
  constructor(
    getConfig: () => Promise<LlmConfig>,
    options: {
      toolRegistries: ToolRegistry[];
      skillRegistries: SkillRegistry[];
      baseSystemPrompt: string;
    },
  );

  // All implemented in the base class, not overridable:
  private getAvailableTools(): ToolDefinition[]; // merge registries + load_skill, dedup
  private buildSystemPrompt(): string; // baseSystemPrompt + skill catalog
  handleUserMessage(userMessage: string): AgentEventStream;
}

class CoreAgent extends Agent {
  constructor(getConfig: () => Promise<LlmConfig>) {
    super(getConfig, {
      toolRegistries: [CoreToolRegistry.getInstance()],
      skillRegistries: [CoreSkillRegistry.getInstance()],
      baseSystemPrompt: 'You are a helpful assistant.',
    });
  }
}
```

### Agent Loop

```
// Agent base class private methods:

getAvailableTools():
  merge all toolRegistries.getAll() + load_skill, dedup by reference
  return tools

buildSystemPrompt():
  parts = [baseSystemPrompt]
  skillCatalog = merge all skillRegistries.getSummaryList()
  if skillCatalog is not empty:
    append skill catalog text to parts
  return joined parts

// Agent base class public method:

handleUserMessage(userMessage):
  round = 0
  maxRounds = read from settings (default 20)
  pendingMessages = [{ role: 'user', content: userMessage }]

  while round < maxRounds:
    tools = getAvailableTools()
    systemPrompt = buildSystemPrompt()

    send pendingMessages to LlmSession, consume event stream (with current tools, systemPrompt):
      text-delta -> yield to caller
      tool-call  -> collect

    if no tool calls -> break (LLM finished answering)

    for each tool call:
      yield tool-execute-start event
      try:
        validate args with tool.parameters.parse()
        context = { availableSkills: current merged skills list }
        result = tool.execute(parsedArgs, context)
        yield tool-execute-end { callId, result, isError: false }
      catch (error):
        yield tool-execute-end { callId, result: error.message, isError: true }

      // Both success and error are submitted as tool results to the LLM.
      // The LLM decides how to handle errors (retry, adapt, or report to user).

    pendingMessages = tool results (as LlmToolResultMessage[])
    round++

  if round >= maxRounds:
    yield done event with reason 'max_rounds_reached'
  else:
    yield done event with reason 'complete'
```

Key detail: **tools are fetched from registries on every loop iteration**, not cached at construction time. This ensures dynamically registered tools (including future MCP tools) are immediately available in the next LLM call.

### Dynamic Tool/Skill Availability

- Tools are resolved from registries at each loop iteration.
- Skill catalog is generated at each loop iteration.
- `LlmSession` does not hold a fixed tool list. Tools are passed in by the caller (`Agent`) on each `streamCompletion` call, consistent with how `getConfig` already works dynamically.

## SSE Events

### Changes to `@omnicraft/sse-events`

**Remove:** `tool-call` (no longer needed — backend executes tools, frontend does not see raw LLM tool call requests).

**Add:**

| Event                | Fields                            | Purpose                      |
| -------------------- | --------------------------------- | ---------------------------- |
| `tool-execute-start` | `callId`, `toolName`, `arguments` | Tool execution has started   |
| `tool-execute-end`   | `callId`, `result`, `isError`     | Tool execution has completed |

**Modify:**

| Event  | Change                                           |
| ------ | ------------------------------------------------ |
| `done` | Add `reason: 'complete' \| 'max_rounds_reached'` |

### Final Event Set

| Event                | Purpose                         |
| -------------------- | ------------------------------- |
| `text-delta`         | Streaming text content from LLM |
| `tool-execute-start` | Tool execution started          |
| `tool-execute-end`   | Tool execution finished         |
| `done`               | Stream ended, with reason       |
| `error`              | Error occurred                  |

### Frontend Lifecycle of a Tool Call

```
tool-execute-start -> tool-execute-end
(start execution)    (result available)
```

In a multi-round loop, the frontend sees interleaved `text-delta` and `tool-execute-*` events until the final `done`.

## Settings Extension

New `agent` section in `@omnicraft/settings-schema`:

```
settings
├── llm (existing)
│   ├── apiFormat
│   ├── apiKey
│   ├── baseUrl
│   └── model
└── agent (new)
    └── maxToolRounds  // default: 20
```

Implemented as `packages/settings-schema/src/agent/schema.ts`, composed into the root schema alongside the existing `llm` section.

## Initialization

Additions to `initServices()` in `startup/init-services.ts`:

```
initServices()
├── SettingsManager.create()         (existing)
├── AgentStore.create()              (existing)
├── LlmSessionStore.create()         (existing)
├── CoreToolRegistry.create()        (new — register load_skill)
├── CoreSkillRegistry.create()       (new)
│   └── loadSkillsFromDirectory(registry, 'data/skills/core/')
└── Future: additional registries as needed
```

## ChatService Changes

`chatService.createSession()` changes from creating `SimpleAgent` to creating `CoreAgent`:

```typescript
// Before
const agent = new SimpleAgent(getLlmConfig);

// After
const agent = new CoreAgent(getLlmConfig);
```

## New Packages

### `@omnicraft/markdown-frontmatter`

A shared package under `packages/markdown-frontmatter/` for parsing YAML frontmatter from Markdown strings.

**Why a new package:** No existing npm package provides a clean, modern (ESM + TypeScript) frontmatter parser without unnecessary dependencies. The parsing logic is simple (split by `---` delimiters + YAML parse), so a lightweight in-house implementation is preferable.

**Dependency:** `yaml` (the modern, maintained YAML parser — ESM, TypeScript, already present in the monorepo's dependency tree).

**API:**

```typescript
interface FrontmatterResult<T> {
  /** Parsed YAML frontmatter as an object. */
  readonly attributes: T;
  /** Markdown body after the frontmatter block. */
  readonly body: string;
}

/** Parses a Markdown string with YAML frontmatter. */
function parseFrontmatter<T>(markdown: string): FrontmatterResult<T>;
```

**Behavior:**

- Input starts with `---\n`, everything between the first and second `---\n` is parsed as YAML.
- The remainder after the second `---\n` is returned as `body`.
- If no valid frontmatter block is found, `attributes` is an empty object and `body` is the entire input.

## Files Affected

### New Files

| Path                                           | Purpose                                                               |
| ---------------------------------------------- | --------------------------------------------------------------------- |
| `packages/markdown-frontmatter/`               | New shared package for YAML frontmatter parsing                       |
| `src/agents/core-agent/core-agent.ts`          | `CoreAgent` — default agent with CoreToolRegistry + CoreSkillRegistry |
| `src/tools/types.ts`                           | `ToolDefinition`, `ToolExecutionContext` interfaces                   |
| `src/tools/tool-registry.ts`                   | `ToolRegistry` abstract base class                                    |
| `src/tools/core-tool-registry.ts`              | `CoreToolRegistry` singleton                                          |
| `src/tools/activate-skill.ts`                  | Built-in `load_skill` singleton tool                                  |
| `src/skills/types.ts`                          | `SkillDefinition` interface                                           |
| `src/skills/skill-registry.ts`                 | `SkillRegistry` abstract base class with `loadFromFile`               |
| `src/skills/core-skill-registry.ts`            | `CoreSkillRegistry` singleton                                         |
| `src/skills/loaders.ts`                        | `loadSkillsFromDirectory` and future discovery functions              |
| `packages/settings-schema/src/agent/schema.ts` | Agent settings schema                                                 |

### Deleted Files

| Path                       | Reason                  |
| -------------------------- | ----------------------- |
| `src/agents/simple-agent/` | Replaced by `CoreAgent` |

### Modified Files

| Path                                     | Change                                                                                                                                               |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/agents/types.ts`                    | `Agent` stays abstract, gains full loop + private `getAvailableTools()` / `buildSystemPrompt()`, constructor accepts registries and baseSystemPrompt |
| `src/api/llm/types.ts`                   | `LlmCompletionOptions` gains `tools` field                                                                                                           |
| `src/api/llm/claude-adapter.ts`          | Convert `ToolDefinition` to Claude tool format                                                                                                       |
| `src/api/llm/openai-adapter.ts`          | Convert `ToolDefinition` to OpenAI tool format                                                                                                       |
| `src/models/llm-session/llm-session.ts`  | Accept tools per call, pass to LLM API                                                                                                               |
| `src/services/chat/chat-service.ts`      | Create `Agent` with registries instead of `SimpleAgent`                                                                                              |
| `src/startup/init-services.ts`           | Initialize registries and load skills                                                                                                                |
| `src/events/event-bus.ts`                | Add registry-related events if needed                                                                                                                |
| `packages/sse-events/src/schema.ts`      | Remove `tool-call`, add `tool-execute-start`/`tool-execute-end`, modify `done`                                                                       |
| `packages/settings-schema/src/schema.ts` | Compose agent settings section                                                                                                                       |
