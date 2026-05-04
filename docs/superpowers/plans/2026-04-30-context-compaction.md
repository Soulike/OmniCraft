# Context Compaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add provider-independent automatic compaction for `LlmSession.messages` when the current prompt reaches 80% of model input capacity.

**Architecture:** `LlmSession` owns compaction and message mutation. `llmApi.countToken()` provides provider-dispatched current prompt token counting. The final implementation slims full history, asks the current model for a summary, appends deterministic recent context, and rewrites history to one synthetic summary user message.

**Note:** Some task details below describe an earlier raw-suffix design. The current design in `../specs/2026-04-30-context-compaction-design.md` supersedes that approach.

**Tech Stack:** TypeScript, Bun, Vitest, Zod, Anthropic SDK, OpenAI SDK, existing `llm-api`, `llm-session`, `Agent`, and `ToolDefinition` modules.

---

## File Structure

Create:

- `apps/backend/src/agent-core/llm-api/token-estimator.ts` — provider-independent conservative fallback token estimator.
- `apps/backend/src/agent-core/llm-api/token-estimator.test.ts` — unit tests for fallback estimator behavior.
- `apps/backend/src/agent-core/llm-session/compaction/constants.ts` — threshold and truncation constants.
- `apps/backend/src/agent-core/llm-session/compaction/slim.ts` — deterministic full-history slimming, recent-context generation, tool hook dispatch, and default truncation.
- `apps/backend/src/agent-core/llm-session/compaction/slim.test.ts` — slimming tests.
- `apps/backend/src/agent-core/llm-session/compaction/prompt.ts` — summary prompt formatting.
- `apps/backend/src/agent-core/llm-session/compaction/prompt.test.ts` — prompt tests.
- `apps/backend/src/agent-core/llm-session/compaction/summary.ts` — summary model call through `llmApi.streamCompletion()`.
- `apps/backend/src/agent-core/llm-session/compaction/summary.test.ts` — summary stream aggregation and failure tests.
- `apps/backend/src/agent-core/llm-session/compaction/index.ts` — public compaction exports.
- `apps/backend/src/agent-core/llm-session/llm-session.test.ts` — integration tests for pre-call and after-turn compaction.

Modify:

- `apps/backend/src/agent-core/llm-api/types.ts` — add `LlmTokenCountOptions`.
- `apps/backend/src/agent-core/llm-api/llm-api.ts` — add `countToken()` dispatch.
- `apps/backend/src/agent-core/llm-api/claude/stream.ts` — keep streaming behavior unchanged while reusing existing helper exports.
- `apps/backend/src/agent-core/llm-api/claude/helpers.ts` — expose request conversion pieces used by both stream and count.
- `apps/backend/src/agent-core/llm-api/claude/index.ts` — export `countClaudeTokens`.
- `apps/backend/src/agent-core/llm-api/openai-responses/stream.ts` — keep streaming behavior unchanged while reusing existing helper exports.
- `apps/backend/src/agent-core/llm-api/openai-responses/helpers.ts` — expose request conversion pieces used by stream and count.
- `apps/backend/src/agent-core/llm-api/openai-responses/index.ts` — export `countOpenAIResponsesTokens`.
- `apps/backend/src/agent-core/llm-api/openai/index.ts` — export `countOpenAITokens` fallback.
- `apps/backend/src/agent-core/llm-api/openai/stream.ts` — keep streaming behavior unchanged while reusing existing helper exports.
- `apps/backend/src/agent-core/llm-api/openai/helpers.ts` — expose OpenAI Chat request projection helper.
- `apps/backend/src/agent-core/llm-api/index.ts` — export new count types.
- `apps/backend/src/agent-core/llm-api/types.ts` — make tool result status required in `llmToolResultMessageSchema`.
- `apps/backend/src/agent-core/llm-session/types.ts` — add `LlmCompactionMetadata`, required `compactions`, `ToolResult.status`, and compaction method option types.
- `apps/backend/src/agent-core/llm-session/index.ts` — export compaction metadata types.
- `apps/backend/src/agent-core/llm-session/llm-session.ts` — store `compactions`, store tool result status, pre-call compact, after-turn compact method, summary writeback.
- `apps/backend/src/agent-core/agent/agent.ts` — pass tool result status and call after-turn compaction at lifecycle boundary.
- `apps/backend/src/agent-core/agent/agent.test.ts` — update snapshots and mock `llmApi.countToken()` in existing agent tests.
- `apps/backend/src/agent-core/agent/persistence/agent-persistence.test.ts` — update test snapshots with `compactions: []`.
- `apps/backend/src/agent-core/tool/types.ts` — add optional `compactResult` hook.
- Built-in tool files under `apps/backend/src/agent/tools/**` — add focused `compactResult` hooks for high-volume tools.
- Existing tests that construct `llmSession` snapshots or tool messages — add required `status` and `compactions` fields.

---

### Task 1: Required Snapshot Metadata And Tool Result Status

**Files:**

- Modify: `apps/backend/src/agent-core/llm-api/types.ts`
- Modify: `apps/backend/src/agent-core/llm-session/types.ts`
- Modify: `apps/backend/src/agent-core/llm-session/llm-session.ts`
- Modify: `apps/backend/src/agent-core/agent/agent.test.ts`
- Modify: `apps/backend/src/agent-core/agent/persistence/agent-persistence.test.ts`
- Modify: `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.test.ts`
- Create: `apps/backend/src/agent-core/llm-session/types.test.ts`

- [ ] **Step 1: Write failing schema tests**

Create `apps/backend/src/agent-core/llm-session/types.test.ts`:

```typescript
import {describe, expect, it} from 'vitest';

import {llmSessionSnapshotSchema} from './types.js';

describe('llmSessionSnapshotSchema', () => {
  it('requires compactions metadata', () => {
    const result = llmSessionSnapshotSchema.safeParse({
      id: 'session-1',
      messages: [],
    });

    expect(result.success).toBe(false);
  });

  it('accepts an empty compactions array', () => {
    const result = llmSessionSnapshotSchema.safeParse({
      id: 'session-1',
      messages: [],
      compactions: [],
    });

    expect(result.success).toBe(true);
  });

  it('requires status on tool result messages', () => {
    const result = llmSessionSnapshotSchema.safeParse({
      id: 'session-1',
      compactions: [],
      messages: [
        {
          id: 'tool-message',
          createdAt: 1,
          role: 'tool',
          callId: 'call-1',
          content: 'done',
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it('accepts status on tool result messages', () => {
    const result = llmSessionSnapshotSchema.safeParse({
      id: 'session-1',
      compactions: [],
      messages: [
        {
          id: 'tool-message',
          createdAt: 1,
          role: 'tool',
          callId: 'call-1',
          content: 'done',
          status: 'success',
        },
      ],
    });

    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run schema tests to verify failure**

Run:

```bash
bun --cwd apps/backend run test src/agent-core/llm-session/types.test.ts
```

Expected: FAIL because `llmSessionSnapshotSchema` still has no `compactions`, and tool messages do not require `status`.

- [ ] **Step 3: Add required schema fields and types**

In `apps/backend/src/agent-core/llm-api/types.ts`, change tool result schema:

```typescript
export const llmToolResultMessageSchema = llmMessageBaseSchema.extend({
  role: z.literal('tool'),
  callId: z.string(),
  status: z.enum(['success', 'failure']),
});
```

In `apps/backend/src/agent-core/llm-session/types.ts`, add metadata and status:

```typescript
export const llmCompactionMetadataSchema = z.object({
  id: z.string(),
  compactedAt: z.number(),
  coveredMessageCount: z.number(),
  rawSuffixCount: z.number(),
  beforeCharCount: z.number(),
  afterCharCount: z.number(),
});

export type LlmCompactionMetadata = z.infer<typeof llmCompactionMetadataSchema>;

export const llmSessionSnapshotSchema = z.object({
  id: z.string(),
  messages: z.array(llmMessageSchema),
  compactions: z.array(llmCompactionMetadataSchema),
});

export interface ToolResult {
  callId: string;
  content: string;
  status: 'success' | 'failure';
}
```

In `apps/backend/src/agent-core/llm-session/llm-session.ts`, initialize and persist compactions:

```typescript
private readonly compactions: LlmCompactionMetadata[] = [];

if (snapshot) {
  this.id = snapshot.id;
  this.messages.push(...snapshot.messages);
  this.compactions.push(...snapshot.compactions);
} else {
  this.id = crypto.randomUUID();
}

toSnapshot(): LlmSessionSnapshot {
  return {
    id: this.id,
    messages: [...this.messages],
    compactions: [...this.compactions],
  };
}
```

Also include `status` when creating tool messages:

```typescript
const toolMessages: LlmMessage[] = results.map((result) => ({
  id: crypto.randomUUID(),
  createdAt: Date.now(),
  role: 'tool' as const,
  callId: result.callId,
  content: result.content,
  status: result.status,
}));
```

- [ ] **Step 4: Update existing test snapshots**

In snapshot objects, change:

```typescript
llmSession: {
  id: 'llm-session-id',
  messages: [],
},
```

to:

```typescript
llmSession: {
  id: 'llm-session-id',
  messages: [],
  compactions: [],
},
```

In `dispatch-agent-tool.test.ts`, update minimal mocks from:

```typescript
llmSession: {messages: []},
```

to:

```typescript
llmSession: {id: 'llm-session-id', messages: [], compactions: []},
```

- [ ] **Step 5: Run focused schema and affected tests**

Run:

```bash
bun --cwd apps/backend run test src/agent-core/llm-session/types.test.ts src/agent-core/agent/agent.test.ts src/agent-core/agent/persistence/agent-persistence.test.ts src/agent/tools/sub-agent/dispatch-agent-tool.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/agent-core/llm-api/types.ts apps/backend/src/agent-core/llm-session/types.ts apps/backend/src/agent-core/llm-session/llm-session.ts apps/backend/src/agent-core/llm-session/types.test.ts apps/backend/src/agent-core/agent/agent.test.ts apps/backend/src/agent-core/agent/persistence/agent-persistence.test.ts apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.test.ts
git commit -m "feat: require compaction metadata in llm snapshots"
```

---

### Task 2: Token Counting API

**Files:**

- Create: `apps/backend/src/agent-core/llm-api/token-estimator.ts`
- Create: `apps/backend/src/agent-core/llm-api/token-estimator.test.ts`
- Modify: `apps/backend/src/agent-core/llm-api/types.ts`
- Modify: `apps/backend/src/agent-core/llm-api/llm-api.ts`
- Modify: `apps/backend/src/agent-core/llm-api/claude/helpers.ts`
- Modify: `apps/backend/src/agent-core/llm-api/claude/index.ts`
- Modify: `apps/backend/src/agent-core/llm-api/openai-responses/helpers.ts`
- Modify: `apps/backend/src/agent-core/llm-api/openai-responses/index.ts`
- Modify: `apps/backend/src/agent-core/llm-api/openai/helpers.ts`
- Modify: `apps/backend/src/agent-core/llm-api/openai/index.ts`
- Modify: `apps/backend/src/agent-core/llm-api/index.ts`
- Test: `apps/backend/src/agent-core/llm-api/token-estimator.test.ts`

- [ ] **Step 1: Write failing estimator tests**

Create `apps/backend/src/agent-core/llm-api/token-estimator.test.ts`:

```typescript
import {describe, expect, it} from 'vitest';

import {estimatePromptTokens} from './token-estimator.js';

describe('estimatePromptTokens', () => {
  it('returns at least one token for non-empty input', () => {
    expect(estimatePromptTokens({message: 'hello'})).toBeGreaterThanOrEqual(1);
  });

  it('grows with serialized input size', () => {
    const small = estimatePromptTokens({message: 'hello'});
    const large = estimatePromptTokens({message: 'hello'.repeat(200)});

    expect(large).toBeGreaterThan(small);
  });
});
```

- [ ] **Step 2: Run estimator tests to verify failure**

Run:

```bash
bun --cwd apps/backend run test src/agent-core/llm-api/token-estimator.test.ts
```

Expected: FAIL because `token-estimator.ts` does not exist.

- [ ] **Step 3: Add fallback estimator**

Create `apps/backend/src/agent-core/llm-api/token-estimator.ts`:

```typescript
const CHARS_PER_TOKEN = 3;

export function estimatePromptTokens(value: unknown): number {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  if (!serialized) return 0;
  return Math.max(1, Math.ceil(serialized.length / CHARS_PER_TOKEN));
}
```

- [ ] **Step 4: Add token count types**

In `apps/backend/src/agent-core/llm-api/types.ts`, add:

```typescript
export type LlmTokenCountOptions = Omit<LlmCompletionOptions, 'signal'>;
```

In `apps/backend/src/agent-core/llm-api/index.ts`, export it with the existing type exports.

- [ ] **Step 5: Add provider count functions**

Add Claude count in `apps/backend/src/agent-core/llm-api/claude/index.ts`:

```typescript
export {countClaudeTokens} from './token-count.js';
export {streamClaude} from './stream.js';
```

Create `apps/backend/src/agent-core/llm-api/claude/token-count.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk';

import type {LlmTokenCountOptions} from '../types.js';
import {estimatePromptTokens} from '../token-estimator.js';
import {
  toClaudeTool,
  toOutputConfig,
  toSdkMessage,
  toThinkingConfig,
} from './helpers.js';

export async function countClaudeTokens(
  options: LlmTokenCountOptions,
): Promise<number> {
  const {config, messages, systemPrompt} = options;
  const client = new Anthropic({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
  });
  const request = {
    model: config.model,
    system: systemPrompt
      ? [{type: 'text' as const, text: systemPrompt}]
      : undefined,
    messages: messages.map(toSdkMessage),
    tools: options.tools.map(toClaudeTool),
    thinking: toThinkingConfig(options.thinkingLevel),
    ...(toOutputConfig(options.thinkingLevel)
      ? {output_config: toOutputConfig(options.thinkingLevel)}
      : {}),
  };

  try {
    const result = await client.messages.countTokens(request);
    return result.input_tokens;
  } catch {
    return estimatePromptTokens(request);
  }
}
```

Add OpenAI Responses count in `apps/backend/src/agent-core/llm-api/openai-responses/index.ts`:

```typescript
export {countOpenAIResponsesTokens} from './token-count.js';
export {streamOpenAIResponses} from './stream.js';
```

Create `apps/backend/src/agent-core/llm-api/openai-responses/token-count.ts`:

```typescript
import OpenAIClient from 'openai';

import type {LlmTokenCountOptions} from '../types.js';
import {estimatePromptTokens} from '../token-estimator.js';
import {toFunctionTool, toInputItems, toReasoning} from './helpers.js';

export async function countOpenAIResponsesTokens(
  options: LlmTokenCountOptions,
): Promise<number> {
  const {config, messages, systemPrompt} = options;
  const client = new OpenAIClient({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
  });
  const request = {
    model: config.model,
    input: toInputItems(messages),
    ...(systemPrompt ? {instructions: systemPrompt} : {}),
    ...(options.tools.length > 0
      ? {tools: options.tools.map(toFunctionTool)}
      : {}),
    ...(toReasoning(options.thinkingLevel)
      ? {reasoning: toReasoning(options.thinkingLevel)}
      : {}),
  };

  try {
    const result = await client.responses.inputTokens.count(request);
    return result.input_tokens;
  } catch {
    return estimatePromptTokens(request);
  }
}
```

Add OpenAI-compatible fallback in `apps/backend/src/agent-core/llm-api/openai/index.ts`:

```typescript
export {countOpenAITokens} from './token-count.js';
export {streamOpenAI} from './stream.js';
```

Create `apps/backend/src/agent-core/llm-api/openai/token-count.ts`:

```typescript
import type OpenAI from 'openai';

import type {LlmTokenCountOptions} from '../types.js';
import {estimatePromptTokens} from '../token-estimator.js';
import {toOpenAITool, toReasoningEffort, toSdkMessage} from './helpers.js';

export async function countOpenAITokens(
  options: LlmTokenCountOptions,
): Promise<number> {
  const messages: OpenAI.ChatCompletionMessageParam[] = [];
  if (options.systemPrompt) {
    messages.push({role: 'system', content: options.systemPrompt});
  }
  messages.push(...options.messages.map(toSdkMessage));

  return estimatePromptTokens({
    model: options.config.model,
    messages,
    tools: options.tools.map(toOpenAITool),
    reasoning_effort: toReasoningEffort(options.thinkingLevel),
  });
}
```

- [ ] **Step 6: Wire llmApi dispatch**

In `apps/backend/src/agent-core/llm-api/llm-api.ts`:

```typescript
import {countClaudeTokens, streamClaude} from './claude/index.js';
import {countOpenAITokens, streamOpenAI} from './openai/index.js';
import {
  countOpenAIResponsesTokens,
  streamOpenAIResponses,
} from './openai-responses/index.js';
import type {
  LlmCompletionOptions,
  LlmEventStream,
  LlmTokenCountOptions,
} from './types.js';

export const llmApi = {
  streamCompletion(options: LlmCompletionOptions): LlmEventStream {
    switch (options.config.apiFormat) {
      case 'claude':
        return streamClaude(options);
      case 'openai':
        return streamOpenAI(options);
      case 'openai-responses':
        return streamOpenAIResponses(options);
    }
  },

  countToken(options: LlmTokenCountOptions): Promise<number> {
    switch (options.config.apiFormat) {
      case 'claude':
        return countClaudeTokens(options);
      case 'openai':
        return countOpenAITokens(options);
      case 'openai-responses':
        return countOpenAIResponsesTokens(options);
    }
  },
};
```

- [ ] **Step 7: Run token count tests and typecheck**

Run:

```bash
bun --cwd apps/backend run test src/agent-core/llm-api/token-estimator.test.ts
bun --cwd apps/backend run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/agent-core/llm-api
git commit -m "feat: add llm token counting"
```

---

### Task 3: Pure Compaction Helpers

**Files:**

- Create: `apps/backend/src/agent-core/llm-session/compaction/constants.ts`
- Create: `apps/backend/src/agent-core/llm-session/compaction/history-split.ts`
- Create: `apps/backend/src/agent-core/llm-session/compaction/history-split.test.ts`
- Create: `apps/backend/src/agent-core/llm-session/compaction/slim.ts`
- Create: `apps/backend/src/agent-core/llm-session/compaction/slim.test.ts`
- Create: `apps/backend/src/agent-core/llm-session/compaction/prompt.ts`
- Create: `apps/backend/src/agent-core/llm-session/compaction/prompt.test.ts`
- Create: `apps/backend/src/agent-core/llm-session/compaction/index.ts`
- Modify: `apps/backend/src/agent-core/tool/types.ts`

- [ ] **Step 1: Add tool hook type**

In `apps/backend/src/agent-core/tool/types.ts`, import LLM message types and extend `ToolDefinition`:

```typescript
import type {LlmToolCall, LlmToolResultMessage} from '../llm-api/types.js';

export interface ToolCompactResultInput {
  readonly content: string;
  readonly status: 'success' | 'failure';
  readonly toolCall: LlmToolCall;
  readonly message: LlmToolResultMessage;
}

export interface ToolDefinition<
  TParams extends z.ZodType = z.ZodType,
  TResult = unknown,
> {
  readonly name: string;
  readonly displayName: string;
  readonly description: string;
  readonly parameters: TParams;
  readonly suppressToolEvents: boolean;
  readonly compactResult?: (input: ToolCompactResultInput) => string | null;
  execute(
    args: z.infer<TParams>,
    context: ToolExecutionContext,
    onOutput?: (chunk: string) => void,
  ): Promise<ToolExecuteResult<TResult>> | ToolExecuteResult<TResult>;
}
```

- [ ] **Step 2: Write failing history split tests**

Create `apps/backend/src/agent-core/llm-session/compaction/history-split.test.ts` with these helpers and tests:

```typescript
import {describe, expect, it} from 'vitest';

import type {LlmMessage} from '../../llm-api/index.js';
import {splitCompactablePrefix} from './history-split.js';

function user(id: string): LlmMessage {
  return {id, createdAt: 1, role: 'user', content: id};
}

function assistantTool(id: string, callId: string): LlmMessage {
  return {
    id,
    createdAt: 1,
    role: 'assistant',
    content: '',
    thinking: [],
    toolCalls: [{callId, toolName: 'read_file', arguments: '{}'}],
  };
}

function tool(id: string, callId: string): LlmMessage {
  return {
    id,
    createdAt: 1,
    role: 'tool',
    callId,
    content: 'result',
    status: 'success',
  };
}

describe('splitCompactablePrefix', () => {
  it('keeps the last N messages', () => {
    const messages = Array.from({length: 12}, (_, index) => user(`m${index}`));
    const result = splitCompactablePrefix(messages, {minRawMessages: 8});

    expect(result.compactablePrefix).toHaveLength(4);
    expect(result.rawSuffix.map((m) => m.id)).toEqual([
      'm4',
      'm5',
      'm6',
      'm7',
      'm8',
      'm9',
      'm10',
      'm11',
    ]);
  });

  it('keeps an unclosed tool call and everything after it', () => {
    const messages = [
      user('old-1'),
      user('old-2'),
      assistantTool('assistant-tool', 'call-1'),
      user('later'),
    ];

    const result = splitCompactablePrefix(messages, {minRawMessages: 1});

    expect(result.compactablePrefix.map((m) => m.id)).toEqual([
      'old-1',
      'old-2',
    ]);
    expect(result.rawSuffix.map((m) => m.id)).toEqual([
      'assistant-tool',
      'later',
    ]);
  });

  it('keeps the most recent closed tool group', () => {
    const messages = [
      user('old'),
      assistantTool('assistant-tool', 'call-1'),
      tool('tool-result', 'call-1'),
      user('final'),
    ];

    const result = splitCompactablePrefix(messages, {minRawMessages: 1});

    expect(result.compactablePrefix.map((m) => m.id)).toEqual(['old']);
    expect(result.rawSuffix.map((m) => m.id)).toEqual([
      'assistant-tool',
      'tool-result',
      'final',
    ]);
  });
});
```

- [ ] **Step 3: Implement history split**

Create `apps/backend/src/agent-core/llm-session/compaction/history-split.ts`:

```typescript
import type {LlmMessage} from '../../llm-api/index.js';

export interface HistorySplitOptions {
  readonly minRawMessages: number;
}

export interface HistorySplitResult {
  readonly compactablePrefix: LlmMessage[];
  readonly rawSuffix: LlmMessage[];
}

export function splitCompactablePrefix(
  messages: readonly LlmMessage[],
  options: HistorySplitOptions,
): HistorySplitResult {
  let rawStart = Math.max(0, messages.length - options.minRawMessages);
  const returnedCallIds = new Set<string>();
  let keptMostRecentToolGroup = false;

  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];

    if (message.role === 'tool') {
      returnedCallIds.add(message.callId);
      continue;
    }

    if (message.role !== 'assistant' || message.toolCalls.length === 0) {
      continue;
    }

    const hasUnclosedToolCall = message.toolCalls.some(
      (toolCall) => !returnedCallIds.has(toolCall.callId),
    );

    if (hasUnclosedToolCall || !keptMostRecentToolGroup) {
      rawStart = Math.min(rawStart, index);
      keptMostRecentToolGroup = true;
    }
  }

  return {
    compactablePrefix: messages.slice(0, rawStart),
    rawSuffix: messages.slice(rawStart),
  };
}
```

- [ ] **Step 4: Write failing slimming tests**

Create `apps/backend/src/agent-core/llm-session/compaction/slim.test.ts`:

```typescript
import {describe, expect, it} from 'vitest';
import {z} from 'zod';

import type {LlmMessage} from '../../llm-api/index.js';
import type {ToolDefinition} from '../../tool/types.js';
import {slimMessagesForSummary, truncateForCompaction} from './slim.js';

const toolCall = {callId: 'call-1', toolName: 'custom_tool', arguments: '{}'};

const customTool: ToolDefinition<z.ZodObject<Record<string, never>>> = {
  name: 'custom_tool',
  displayName: 'Custom Tool',
  description: 'Custom tool',
  parameters: z.object({}),
  suppressToolEvents: false,
  compactResult: () => 'compact custom result',
  execute: () => ({status: 'success', content: 'ok', data: {}}),
};

describe('truncateForCompaction', () => {
  it('keeps short content unchanged', () => {
    expect(truncateForCompaction('short')).toBe('short');
  });

  it('adds an omitted marker for large content', () => {
    const result = truncateForCompaction('a'.repeat(9000));

    expect(result).toContain('truncated for compaction only');
    expect(result.length).toBeLessThan(9000);
  });
});

describe('slimMessagesForSummary', () => {
  it('drops assistant thinking blocks', () => {
    const messages: LlmMessage[] = [
      {
        id: 'assistant',
        createdAt: 1,
        role: 'assistant',
        content: 'text',
        toolCalls: [],
        thinking: [{content: ['private'], signature: 'sig'}],
      },
    ];

    const result = slimMessagesForSummary(messages, []);

    expect(result[0]).not.toContain('private');
    expect(result[0]).toContain('assistant');
    expect(result[0]).toContain('text');
  });

  it('uses tool compactResult when available', () => {
    const messages: LlmMessage[] = [
      {
        id: 'assistant',
        createdAt: 1,
        role: 'assistant',
        content: '',
        thinking: [],
        toolCalls: [toolCall],
      },
      {
        id: 'tool',
        createdAt: 1,
        role: 'tool',
        callId: 'call-1',
        content: 'raw result',
        status: 'success',
      },
    ];

    const result = slimMessagesForSummary(messages, [customTool]);

    expect(result.join('\n')).toContain('compact custom result');
    expect(result.join('\n')).not.toContain('raw result');
  });
});
```

- [ ] **Step 5: Implement constants and slimming**

Create `apps/backend/src/agent-core/llm-session/compaction/constants.ts`:

```typescript
export const COMPACTION_THRESHOLD_RATIO = 0.8;
export const MIN_RAW_MESSAGES = 8;
export const DEFAULT_TRUNCATE_LIMIT = 8 * 1024;
export const DEFAULT_TRUNCATE_HEAD = 4 * 1024;
export const DEFAULT_TRUNCATE_TAIL = 2 * 1024;
```

Create `apps/backend/src/agent-core/llm-session/compaction/slim.ts`:

```typescript
import type {LlmMessage, LlmToolCall} from '../../llm-api/index.js';
import type {ToolDefinition} from '../../tool/types.js';
import {
  DEFAULT_TRUNCATE_HEAD,
  DEFAULT_TRUNCATE_LIMIT,
  DEFAULT_TRUNCATE_TAIL,
} from './constants.js';

export function truncateForCompaction(content: string): string {
  if (content.length <= DEFAULT_TRUNCATE_LIMIT) return content;

  const head = content.slice(0, DEFAULT_TRUNCATE_HEAD);
  const tail = content.slice(-DEFAULT_TRUNCATE_TAIL);
  const omitted = content.length - head.length - tail.length;

  return `${head}\n\n[Tool result truncated for compaction only. Original length: ${content.length.toString()} chars. Omitted ${omitted.toString()} chars.]\n\n${tail}`;
}

export function slimMessagesForSummary(
  messages: readonly LlmMessage[],
  tools: readonly ToolDefinition[],
): string[] {
  const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));
  const toolCallsById = new Map<string, LlmToolCall>();
  const result: string[] = [];

  for (const message of messages) {
    if (message.role === 'assistant') {
      for (const toolCall of message.toolCalls) {
        toolCallsById.set(toolCall.callId, toolCall);
      }
      result.push(
        JSON.stringify({
          role: 'assistant',
          content: message.content,
          toolCalls: message.toolCalls,
        }),
      );
      continue;
    }

    if (message.role === 'tool') {
      const toolCall = toolCallsById.get(message.callId);
      const tool = toolCall ? toolsByName.get(toolCall.toolName) : undefined;
      const content = toolCall
        ? tool?.compactResult?.({
            content: message.content,
            status: message.status,
            toolCall,
            message,
          })
        : undefined;

      if (content === null) continue;

      result.push(
        JSON.stringify({
          role: 'tool',
          callId: message.callId,
          status: message.status,
          content: content ?? truncateForCompaction(message.content),
        }),
      );
      continue;
    }

    result.push(
      JSON.stringify({
        role: 'user',
        content: truncateForCompaction(message.content),
      }),
    );
  }

  return result;
}
```

- [ ] **Step 6: Add prompt formatter**

Create `apps/backend/src/agent-core/llm-session/compaction/prompt.ts`:

```typescript
export function buildCompactionPrompt(
  slimmedMessages: readonly string[],
): string {
  return [
    'Summarize the earlier conversation history for an agent that will continue working.',
    'Preserve user goals, explicit requirements, corrections, constraints, preferences, and acceptance criteria.',
    'Preserve important files, paths, commands, tool results, errors, failures, hypotheses, decisions, pending work, and next steps.',
    'Do not invent facts. Do not weaken user instructions because they appeared early.',
    'Return only the summary text.',
    '',
    '<history_to_summarize>',
    ...slimmedMessages,
    '</history_to_summarize>',
  ].join('\n');
}
```

Create `apps/backend/src/agent-core/llm-session/compaction/prompt.test.ts`:

```typescript
import {describe, expect, it} from 'vitest';

import {buildCompactionPrompt} from './prompt.js';

describe('buildCompactionPrompt', () => {
  it('includes summary instructions and history', () => {
    const prompt = buildCompactionPrompt(['message one']);

    expect(prompt).toContain('Preserve user goals');
    expect(prompt).toContain('<history_to_summarize>');
    expect(prompt).toContain('message one');
  });
});
```

- [ ] **Step 7: Export helpers**

Create `apps/backend/src/agent-core/llm-session/compaction/index.ts`:

```typescript
export * from './constants.js';
export * from './history-split.js';
export * from './prompt.js';
export * from './slim.js';
```

- [ ] **Step 8: Run compaction helper tests**

Run:

```bash
bun --cwd apps/backend run test src/agent-core/llm-session/compaction/history-split.test.ts src/agent-core/llm-session/compaction/slim.test.ts src/agent-core/llm-session/compaction/prompt.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/agent-core/llm-session/compaction apps/backend/src/agent-core/tool/types.ts
git commit -m "feat: add context compaction helpers"
```

---

### Task 4: Summary Generation

**Files:**

- Create: `apps/backend/src/agent-core/llm-session/compaction/summary.ts`
- Create: `apps/backend/src/agent-core/llm-session/compaction/summary.test.ts`
- Modify: `apps/backend/src/agent-core/llm-session/compaction/index.ts`

- [ ] **Step 1: Write failing summary tests**

Create `apps/backend/src/agent-core/llm-session/compaction/summary.test.ts`:

```typescript
import {describe, expect, it, vi, afterEach} from 'vitest';

import {
  llmApi,
  type LlmConfig,
  type LlmEventStream,
} from '../../llm-api/index.js';
import {generateCompactionSummary} from './summary.js';

const CONFIG: LlmConfig = {
  apiFormat: 'openai',
  apiKey: 'key',
  baseUrl: 'https://example.test',
  model: 'model',
};

async function* summaryStream(): LlmEventStream {
  yield {type: 'message-start', messageId: 'summary'};
  yield {type: 'text-delta', content: 'summary '};
  yield {type: 'text-delta', content: 'text'};
  yield {
    type: 'message-end',
    stopReason: 'end_turn',
    usage: {inputTokens: 1, outputTokens: 1, cacheReadInputTokens: 0},
  };
}

describe('generateCompactionSummary', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('aggregates text deltas from llmApi', async () => {
    vi.spyOn(llmApi, 'streamCompletion').mockReturnValue(summaryStream());

    const summary = await generateCompactionSummary({
      config: CONFIG,
      prompt: 'summarize this',
    });

    expect(summary).toBe('summary text');
  });
});
```

- [ ] **Step 2: Implement summary generation**

Create `apps/backend/src/agent-core/llm-session/compaction/summary.ts`:

```typescript
import crypto from 'node:crypto';

import type {LlmConfig, LlmMessage} from '../../llm-api/index.js';
import {llmApi} from '../../llm-api/index.js';

export interface GenerateCompactionSummaryOptions {
  readonly config: Readonly<LlmConfig>;
  readonly prompt: string;
}

export async function generateCompactionSummary(
  options: GenerateCompactionSummaryOptions,
): Promise<string> {
  const messages: LlmMessage[] = [
    {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      role: 'user',
      content: options.prompt,
    },
  ];

  let text = '';
  const stream = llmApi.streamCompletion({
    config: options.config,
    messages,
    tools: [],
    thinkingLevel: 'none',
  });

  for await (const event of stream) {
    if (event.type === 'text-delta') {
      text += event.content;
    }
  }

  return text.trim();
}
```

- [ ] **Step 3: Export summary function**

In `apps/backend/src/agent-core/llm-session/compaction/index.ts`:

```typescript
export * from './summary.js';
```

- [ ] **Step 4: Run summary tests**

Run:

```bash
bun --cwd apps/backend run test src/agent-core/llm-session/compaction/summary.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/agent-core/llm-session/compaction
git commit -m "feat: add compaction summary generation"
```

---

### Task 5: LlmSession Compaction Integration

**Files:**

- Modify: `apps/backend/src/agent-core/llm-session/types.ts`
- Modify: `apps/backend/src/agent-core/llm-session/llm-session.ts`
- Create: `apps/backend/src/agent-core/llm-session/llm-session.test.ts`

- [ ] **Step 1: Write failing LlmSession compaction tests**

Create `apps/backend/src/agent-core/llm-session/llm-session.test.ts`:

```typescript
import {afterEach, describe, expect, it, vi} from 'vitest';

import {llmApi, type LlmConfig, type LlmEventStream} from '../llm-api/index.js';
import {LlmSession} from './llm-session.js';

const CONFIG: LlmConfig = {
  apiFormat: 'openai',
  apiKey: 'key',
  baseUrl: 'https://example.test',
  model: 'gpt-4.1',
};

async function* normalStream(): LlmEventStream {
  yield {type: 'message-start', messageId: 'assistant'};
  yield {type: 'text-delta', content: 'reply'};
  yield {
    type: 'message-end',
    stopReason: 'end_turn',
    usage: {inputTokens: 1, outputTokens: 1, cacheReadInputTokens: 0},
  };
}

async function* summaryStream(): LlmEventStream {
  yield {type: 'message-start', messageId: 'summary'};
  yield {type: 'text-delta', content: 'summary text'};
  yield {
    type: 'message-end',
    stopReason: 'end_turn',
    usage: {inputTokens: 1, outputTokens: 1, cacheReadInputTokens: 0},
  };
}

async function drain(stream: AsyncIterable<unknown>): Promise<void> {
  for await (const _event of stream) {
    // Drain stream.
  }
}

describe('LlmSession compaction', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes snapshots with empty compactions', () => {
    const session = new LlmSession(() => Promise.resolve(CONFIG));

    expect(session.toSnapshot().compactions).toEqual([]);
  });

  it('compacts before model call when countToken reaches threshold', async () => {
    vi.spyOn(llmApi, 'countToken').mockResolvedValue(200_000);
    vi.spyOn(llmApi, 'streamCompletion').mockImplementation((options) => {
      const isSummaryRequest =
        options.tools.length === 0 &&
        options.messages.length === 1 &&
        options.messages[0]?.role === 'user' &&
        options.messages[0].content.includes('<history_to_summarize>');

      if (isSummaryRequest) return summaryStream();

      const hasSummaryMessage = options.messages.some(
        (message) =>
          message.role === 'user' &&
          message.content.includes('<conversation_summary>'),
      );

      expect(hasSummaryMessage).toBe(true);
      return normalStream();
    });

    const session = new LlmSession(() => Promise.resolve(CONFIG), {
      id: 'session-1',
      compactions: [],
      messages: Array.from({length: 12}, (_, index) => ({
        id: `old-${index.toString()}`,
        createdAt: 1,
        role: 'user' as const,
        content: `old message ${index.toString()}`,
      })),
    });

    await drain(session.sendUserMessage('hello', [], '', 'none').stream);

    const snapshot = session.toSnapshot();

    expect(llmApi.countToken).toHaveBeenCalled();
    expect(snapshot.messages[0]?.role).toBe('user');
    expect(snapshot.messages[0]?.content).toContain('<conversation_summary>');
    expect(snapshot.compactions).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Add compaction options types**

In `apps/backend/src/agent-core/llm-session/types.ts`:

```typescript
import type {ThinkingLevel} from '@omnicraft/api-schema';
import type {ToolDefinition} from '../tool/types.js';

export type LlmCompactionReason = 'before-llm-call' | 'after-turn';

export interface LlmCompactionOptions {
  readonly reason: LlmCompactionReason;
  readonly tools: readonly ToolDefinition[];
  readonly systemPrompt: string;
  readonly thinkingLevel: ThinkingLevel;
}
```

- [ ] **Step 3: Implement compactIfNeeded in LlmSession**

In `apps/backend/src/agent-core/llm-session/llm-session.ts`, import compaction helpers and model capacity:

```typescript
import {
  buildCompactionPrompt,
  COMPACTION_THRESHOLD_RATIO,
  generateCompactionSummary,
  MIN_RAW_MESSAGES,
  slimMessagesForSummary,
  splitCompactablePrefix,
} from './compaction/index.js';
import {modelCapacity} from '../model-capacity/index.js';
```

Add public method:

```typescript
async compactIfNeeded(options: LlmCompactionOptions): Promise<boolean> {
  const config = await this.getConfig();
  const maxInputTokens = await modelCapacity.getMaxInputTokens(config);
  const currentTokens = await llmApi.countToken({
    config,
    messages: this.messages,
    systemPrompt: options.systemPrompt || undefined,
    tools: options.tools,
    thinkingLevel: options.thinkingLevel,
  });

  if (currentTokens < maxInputTokens * COMPACTION_THRESHOLD_RATIO) {
    return false;
  }

  const beforeCharCount = JSON.stringify(this.messages).length;
  const {compactablePrefix, rawSuffix} = splitCompactablePrefix(this.messages, {
    minRawMessages: MIN_RAW_MESSAGES,
  });

  if (compactablePrefix.length === 0) return false;

  const slimmed = slimMessagesForSummary(compactablePrefix, options.tools);
  const prompt = buildCompactionPrompt(slimmed);
  const summary = await generateCompactionSummary({config, prompt});
  const summaryMessage: LlmMessage = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    role: 'user',
    content: `<conversation_summary>\n${summary}\n</conversation_summary>`,
  };

  this.messages.length = 0;
  this.messages.push(summaryMessage, ...rawSuffix);
  this.compactions.push({
    id: crypto.randomUUID(),
    compactedAt: Date.now(),
    coveredMessageCount: compactablePrefix.length,
    rawSuffixCount: rawSuffix.length,
    beforeCharCount,
    afterCharCount: JSON.stringify(this.messages).length,
  });

  return true;
}
```

- [ ] **Step 4: Call compact before normal provider stream**

In `streamCompletion()`, before `llmApi.streamCompletion(...)`:

```typescript
await this.compactIfNeeded({
  reason: 'before-llm-call',
  tools,
  systemPrompt,
  thinkingLevel,
});
const llmConfig = await this.getConfig();
const eventStream = llmApi.streamCompletion({
  config: llmConfig,
  messages: this.messages,
  systemPrompt: systemPrompt || undefined,
  tools,
  thinkingLevel,
  signal,
});
```

- [ ] **Step 5: Run LlmSession tests**

Run:

```bash
bun --cwd apps/backend run test src/agent-core/llm-session/llm-session.test.ts src/agent-core/llm-session/types.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/agent-core/llm-session apps/backend/src/agent-core/llm-api/types.ts
git commit -m "feat: compact llm session history"
```

---

### Task 6: Agent Lifecycle And Tool Status Propagation

**Files:**

- Modify: `apps/backend/src/agent-core/agent/agent.ts`
- Modify: `apps/backend/src/agent-core/agent/agent.test.ts`

- [ ] **Step 1: Add status to ToolResult construction**

In `apps/backend/src/agent-core/agent/agent.ts`, unknown tools produce failure results:

```typescript
toolResults.set(toolCall.callId, {
  callId: toolCall.callId,
  content: `Error: Unknown tool: ${toolCall.toolName}`,
  status: 'failure',
});
```

For executed tools, preserve result status:

```typescript
toolResults.set(toolCall.callId, {
  callId: toolCall.callId,
  content: result.content,
  status: result.status === 'success' ? 'success' : 'failure',
});
```

- [ ] **Step 2: Replace done-callback persistence with after-pump persistence**

In `runTurn()`, change the `pump` callback so it handles only title generation:

```typescript
await this.pump(stream, (event) => {
  if (
    event.type === 'message-start' &&
    event.role === 'user' &&
    this.title === Agent.DEFAULT_TITLE &&
    !this.isGeneratingTitle
  ) {
    this.isGeneratingTitle = true;
    void this.generateAndEmitTitle(event.content).finally(() => {
      this.isGeneratingTitle = false;
    });
  }
});
await this.persistSnapshot().catch((err: unknown) => {
  logger.error({err}, 'Failed to persist snapshot');
});
```

This persists after the generator finishes, which lets after-turn compaction complete before the snapshot write.

- [ ] **Step 3: Compact after final done in runAgentLoop**

Create a helper in `Agent`:

```typescript
private async compactAfterTurn(
  tools: readonly ToolDefinition[],
  systemPrompt: string,
  thinkingLevel: ThinkingLevel,
): Promise<void> {
  try {
    await this.llmSession.compactIfNeeded({
      reason: 'after-turn',
      tools,
      systemPrompt,
      thinkingLevel,
    });
  } catch (err) {
    logger.error({err}, 'Failed to compact LLM session after turn');
  }
}
```

After each final `yield {type: 'done', ...}` in `runAgentLoop()`, call:

```typescript
await this.compactAfterTurn(toolDefs, systemPrompt, thinkingLevel);
```

Do this for `complete`, `max_rounds_reached`, and aborted completion paths where `toolDefs` and `systemPrompt` are in scope.

- [ ] **Step 4: Update Agent tests for countToken mock**

In `apps/backend/src/agent-core/agent/agent.test.ts`, any test that mocks `llmApi.streamCompletion` must also mock count below the threshold:

```typescript
vi.spyOn(llmApi, 'countToken').mockResolvedValue(1);
```

- [ ] **Step 5: Run Agent tests**

Run:

```bash
bun --cwd apps/backend run test src/agent-core/agent/agent.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/agent-core/agent/agent.ts apps/backend/src/agent-core/agent/agent.test.ts
git commit -m "feat: compact after agent turns"
```

---

### Task 7: Built-In Tool Compaction Hooks And Final Verification

**Files:**

- Modify: `apps/backend/src/agent/tools/bash/run-command.ts`
- Modify: `apps/backend/src/agent/tools/file/read-file.ts`
- Modify: `apps/backend/src/agent/tools/file/search-files.ts`
- Modify: `apps/backend/src/agent/tools/file/find-files.ts`
- Modify: `apps/backend/src/agent/tools/web/web-fetch.ts`
- Modify: `apps/backend/src/agent/tools/web/web-fetch-raw.ts`
- Modify: `apps/backend/src/agent/tools/web/web-search.ts`
- Modify: `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts`
- Modify: `apps/backend/src/agent/tools/todo/todo-list.ts`
- Modify: `apps/backend/src/agent/tools/todo/todo-append.ts`
- Modify: `apps/backend/src/agent/tools/todo/todo-update.ts`
- Modify: `apps/backend/src/agent/tools/todo/todo-clear.ts`
- Modify: corresponding existing tool tests if assertions need hook coverage.

- [ ] **Step 1: Add run_command hook**

In `runCommandTool`, add:

```typescript
compactResult({content, status, toolCall}) {
  let command = '';
  try {
    const args = JSON.parse(toolCall.arguments) as {command?: string};
    command = args.command ?? '';
  } catch {
    command = '';
  }

  const importantLines = content
    .split('\n')
    .filter((line) =>
      /Error:|Exit code:|Working directory|Output saved to file|stderr saved to file|Command timed out/i.test(
        line,
      ),
    );

  return [
    `run_command ${status}`,
    command ? `Command: ${command}` : '',
    ...importantLines.slice(0, 20),
  ]
    .filter(Boolean)
    .join('\n');
},
```

- [ ] **Step 2: Add read_file hook**

In `readFileTool`, add:

```typescript
compactResult({content, status, toolCall}) {
  let filePath = '';
  try {
    const args = JSON.parse(toolCall.arguments) as {
      filePath?: string;
      startLine?: number;
      lineCount?: number;
    };
    filePath = args.filePath ?? '';
  } catch {
    filePath = '';
  }

  const header = content.split('\n')[0] ?? '';
  return [
    `read_file ${status}`,
    filePath ? `File: ${filePath}` : header,
    header && header !== filePath ? header : '',
  ]
    .filter(Boolean)
    .join('\n');
},
```

- [ ] **Step 3: Add search/find/web/subagent/todo hooks**

Use concise metadata hooks. For search-style tools, keep the header and first 20 result lines:

```typescript
compactResult({content, status}) {
  const lines = content.split('\n').filter(Boolean);
  return [`${this.name} ${status}`, ...lines.slice(0, 21)].join('\n');
},
```

Because object literal `this` is not stable in arrow functions, use the literal tool name in each file, for example in `webSearchTool`:

```typescript
compactResult({content, status}) {
  const lines = content.split('\n').filter(Boolean);
  return [`web_search ${status}`, ...lines.slice(0, 21)].join('\n');
},
```

For `dispatch_agent`, keep the returned summary unless it is empty:

```typescript
compactResult({content}) {
  return content.trim() || null;
},
```

For todo mutation/list tools, keep only the latest old snapshot summary by returning a short header and first 30 lines:

```typescript
compactResult({content, status}) {
  const lines = content.split('\n').filter(Boolean);
  return [`todo state ${status}`, ...lines.slice(0, 30)].join('\n');
},
```

- [ ] **Step 4: Run tool tests**

Run:

```bash
bun --cwd apps/backend run test src/agent/tools
```

Expected: PASS.

- [ ] **Step 5: Run backend typecheck and full backend tests**

Run:

```bash
bun --cwd apps/backend run typecheck
bun --cwd apps/backend run test
```

Expected: PASS.

- [ ] **Step 6: Run backend lint**

Run:

```bash
bun --cwd apps/backend run lint
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/agent-core apps/backend/src/agent/tools
git commit -m "feat: add tool-aware compaction hooks"
```

---

## Final Verification

- [ ] Run all backend tests:

```bash
bun --cwd apps/backend run test
```

- [ ] Run backend typecheck:

```bash
bun --cwd apps/backend run typecheck
```

- [ ] Run backend lint:

```bash
bun --cwd apps/backend run lint
```

- [ ] Confirm `git status --short` shows no unexpected files.

```bash
git status --short
```

Expected: no output unless intentional follow-up files are staged for a final commit.

## Self-Review Notes

- Spec coverage: trigger points, `llmApi.countToken()`, safe suffix, deterministic slimming, tool hooks, summary writeback, required `status`, required `compactions`, failure handling, and provider-independent v1 behavior are each mapped to tasks above.
- Type consistency: `ToolResult.status`, `LlmToolResultMessage.status`, `LlmCompactionMetadata`, `compactIfNeeded()`, and `llmApi.countToken()` names are consistent across tasks.
- Scope: provider-managed compact APIs, manual compact commands, frontend usage UI, first-class `summary` role, and summary self-check remain out of scope as specified.
