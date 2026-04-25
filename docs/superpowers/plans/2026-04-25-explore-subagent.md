# Explore Subagent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `explore` subagent type that main agents can delegate repository and architecture research to through the existing `dispatch_agent` tool.

**Architecture:** Implement `ExploreSubAgent` as a regular `Agent` subclass with read/report behavior defined by its system prompt. Wire it into `dispatch_agent` as a new agent type, and put main-agent delegation guidance in `SubAgentToolRegistry.getSystemPromptSection()` so the policy stays attached to the subagent tool domain.

**Tech Stack:** TypeScript, Bun, Vitest, Zod, existing OmniCraft agent/tool registries.

---

## File Structure

- `apps/backend/src/agent/agents/explore-sub-agent/system-prompt.ts` owns Explore's role, soft read-only behavior, Bash guidance, and default report structure.
- `apps/backend/src/agent/agents/explore-sub-agent/explore-sub-agent.ts` constructs the Explore agent with core, file, web, and Bash tools, plus core skills.
- `apps/backend/src/agent/agents/explore-sub-agent/index.ts` exports the new agent folder.
- `apps/backend/src/agent/agents/index.ts` re-exports Explore from the central agent barrel.
- `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts` exports subagent type constants, adds Explore to the dispatch schema, and creates the correct subagent class.
- `apps/backend/src/agent/tools/sub-agent/sub-agent-tool-registry.ts` adds separate general dispatch guidance and Explore-specific dispatch guidance for main agents.
- `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.test.ts` covers the new dispatch schema, description, factory behavior, and prompt section.

---

### Task 1: Add Failing Dispatch Tests

**Files:**

- Modify: `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.test.ts`

- [ ] **Step 1: Add imports for registry and agent construction tests**

Replace the imports at the top of `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.test.ts` with:

```typescript
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {ExploreSubAgent, GeneralSubAgent} from '@/agent/agents/index.js';
import {CoreSkillRegistry} from '@/agent/skills/index.js';
import {
  BashToolRegistry,
  CoreToolRegistry,
  FileToolRegistry,
  WebToolRegistry,
} from '@/agent/tools/index.js';
import {createMockContext} from '@/agent-core/tool/testing.js';
import type {ToolExecutionContext} from '@/agent-core/tool/types.js';

import {
  createSubAgent,
  dispatchAgentTool,
  SUB_AGENT_TYPE,
} from './dispatch-agent-tool.js';
import {SubAgentToolRegistry} from './sub-agent-tool-registry.js';
```

- [ ] **Step 2: Add registry lifecycle helpers**

Add these helpers after the imports in the same test file:

```typescript
function resetAgentRegistries(): void {
  CoreToolRegistry.resetInstance();
  FileToolRegistry.resetInstance();
  WebToolRegistry.resetInstance();
  BashToolRegistry.resetInstance();
  CoreSkillRegistry.resetInstance();
}

function initAgentRegistries(): void {
  CoreToolRegistry.create();
  FileToolRegistry.create();
  WebToolRegistry.create();
  BashToolRegistry.create();
  CoreSkillRegistry.create();
}
```

- [ ] **Step 3: Add tests for schema, tool description, factory, and registry prompt**

Add these tests inside the existing `describe('dispatchAgentTool', () => { ... })`, after the `has the correct name` test and before `describe('workingDirectory boundary check', ...)`:

```typescript
it('accepts the explore agent type', () => {
  const result = dispatchAgentTool.parameters.safeParse({
    task: 'Map the backend agent architecture',
    agentType: SUB_AGENT_TYPE.EXPLORE,
  });

  expect(result.success).toBe(true);
});

it('documents general and explore agent types', () => {
  expect(dispatchAgentTool.description).toContain(
    `- ${SUB_AGENT_TYPE.GENERAL} (General):`,
  );
  expect(dispatchAgentTool.description).toContain(
    `- ${SUB_AGENT_TYPE.EXPLORE} (Explore):`,
  );
});

it('creates a general subagent by default', () => {
  resetAgentRegistries();
  initAgentRegistries();
  try {
    const subagent = createSubAgent(
      SUB_AGENT_TYPE.GENERAL,
      context.getConfig,
      tmpDir,
    );

    expect(subagent).toBeInstanceOf(GeneralSubAgent);
  } finally {
    resetAgentRegistries();
  }
});

it('creates an explore subagent for explore tasks', () => {
  resetAgentRegistries();
  initAgentRegistries();
  try {
    const subagent = createSubAgent(
      SUB_AGENT_TYPE.EXPLORE,
      context.getConfig,
      tmpDir,
    );

    expect(subagent).toBeInstanceOf(ExploreSubAgent);
  } finally {
    resetAgentRegistries();
  }
});

it('adds subagent dispatch guidance to the system prompt section', () => {
  SubAgentToolRegistry.resetInstance();
  const registry = SubAgentToolRegistry.create();
  try {
    const section = registry.getSystemPromptSection();

    expect(section).toContain('## Subagent Dispatch');
    expect(section).toContain('### General delegation');
    expect(section).toContain('### Explore subagent');
    expect(section).toContain(`\`${dispatchAgentTool.name}\``);
    expect(section).toContain(`\`${SUB_AGENT_TYPE.EXPLORE}\``);
    expect(section).toContain('architecture');
    expect(section).toContain('report');
  } finally {
    SubAgentToolRegistry.resetInstance();
  }
});
```

- [ ] **Step 4: Run the targeted test and verify it fails**

Run:

```bash
bun run --filter '@omnicraft/backend' test -- src/agent/tools/sub-agent/dispatch-agent-tool.test.ts
```

Expected: FAIL because `ExploreSubAgent`, `createSubAgent`, and `SUB_AGENT_TYPE` are not exported yet, or because `SUB_AGENT_TYPE.EXPLORE` is rejected and the prompt section is empty.

---

### Task 2: Add ExploreSubAgent

**Files:**

- Create: `apps/backend/src/agent/agents/explore-sub-agent/system-prompt.ts`
- Create: `apps/backend/src/agent/agents/explore-sub-agent/explore-sub-agent.ts`
- Create: `apps/backend/src/agent/agents/explore-sub-agent/index.ts`
- Modify: `apps/backend/src/agent/agents/index.ts`

- [ ] **Step 1: Create the Explore system prompt**

Create `apps/backend/src/agent/agents/explore-sub-agent/system-prompt.ts`:

```typescript
export const exploreSubAgentSystemPrompt = [
  '# Explore Subagent',
  '',
  "You are OmniCraft's Explore subagent, a delegated research agent. Your job is to investigate the question assigned by the main agent, inspect relevant project files and documentation, and return an evidence-based report the main agent can use.",
  '',
  '## Scope',
  '',
  '- Focus on research, analysis, and reporting. Do not make code, documentation, configuration, dependency, or environment changes.',
  '- Read project files, tests, docs, configuration, and recent git history when they are relevant to the question.',
  '- Use web tools only when the delegated task needs external or current information. Prefer repository evidence for repository questions.',
  '- If you discover that a change is needed, describe the recommendation in your report instead of making the change.',
  '',
  '## Bash Usage',
  '',
  '- Bash is available for observation and discovery. Use commands such as `rg`, `find`, `ls`, `sed`, `git status`, `git diff`, `git show`, `git log`, and `wc` to inspect the workspace efficiently.',
  '- Do not run commands whose expected purpose is to modify files, install packages, rewrite formatting, generate artifacts, start long-running services, or mutate repository state.',
  '- Prefer narrow commands and targeted searches. Avoid dumping large unrelated outputs into the conversation.',
  '',
  '## Research Quality',
  '',
  '- Prefer concrete evidence over speculation. Cite file paths, exported names, tests, docs, commands, and observed behavior when they support your answer.',
  "- Follow the user's or main agent's requested scope and depth. If the task asks for a special output format, use that format.",
  '- Call out uncertainty clearly when evidence is incomplete or when multiple interpretations are possible.',
  '',
  '## Default Report Format',
  '',
  'Use this structure unless the delegated task asks for a different format:',
  '',
  '1. Direct answer',
  '2. Key evidence',
  '3. Architecture or flow',
  '4. Gaps and uncertainty',
  '5. Suggested next steps',
].join('\n');
```

- [ ] **Step 2: Create the Explore agent class**

Create `apps/backend/src/agent/agents/explore-sub-agent/explore-sub-agent.ts`:

```typescript
import {CoreSkillRegistry} from '@/agent/skills/index.js';
import {
  BashToolRegistry,
  CoreToolRegistry,
  FileToolRegistry,
  WebToolRegistry,
} from '@/agent/tools/index.js';
import {Agent} from '@/agent-core/agent/index.js';
import type {LlmConfig} from '@/agent-core/llm-api/index.js';
import {settingsService} from '@/services/settings/index.js';

import {exploreSubAgentSystemPrompt} from './system-prompt.js';

/**
 * Research-focused subagent dispatched by the main agent.
 * It can inspect the workspace and return reports, but its prompt forbids mutations.
 */
export class ExploreSubAgent extends Agent {
  constructor(getConfig: () => Promise<LlmConfig>, workingDirectory: string) {
    super(getConfig, {
      toolRegistries: [
        CoreToolRegistry.getInstance(),
        FileToolRegistry.getInstance(),
        WebToolRegistry.getInstance(),
        BashToolRegistry.getInstance(),
      ],
      skillRegistries: [CoreSkillRegistry.getInstance()],
      baseSystemPrompt: exploreSubAgentSystemPrompt,
      getMaxToolRounds: async () => {
        const settings = await settingsService.getAll();
        return settings.agent.maxToolRounds;
      },
      workingDirectory,
    });
  }
}
```

- [ ] **Step 3: Export the Explore agent folder**

Create `apps/backend/src/agent/agents/explore-sub-agent/index.ts`:

```typescript
export {ExploreSubAgent} from './explore-sub-agent.js';
```

- [ ] **Step 4: Re-export Explore from the central agent barrel**

Replace `apps/backend/src/agent/agents/index.ts` with:

```typescript
export {CodingAgent} from './coding-agent/index.js';
export {CodingSubAgent} from './coding-sub-agent/index.js';
export {ExploreSubAgent} from './explore-sub-agent/index.js';
export {GeneralSubAgent} from './general-sub-agent/index.js';
export {MainAgent} from './main-agent/index.js';
```

- [ ] **Step 5: Run typecheck and note the expected remaining failures**

Run:

```bash
bun run --filter '@omnicraft/backend' typecheck
```

Expected: FAIL because `createSubAgent` is imported by the test but has not been added to `dispatch-agent-tool.ts` yet. If the test file is excluded from typecheck in this configuration, continue to Task 3.

---

### Task 3: Wire Explore into dispatch_agent

**Files:**

- Modify: `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts`

- [ ] **Step 1: Update imports**

In `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts`, replace:

```typescript
import {GeneralSubAgent} from '@/agent/agents/index.js';
import type {Agent} from '@/agent-core/agent/index.js';
```

with:

```typescript
import {ExploreSubAgent, GeneralSubAgent} from '@/agent/agents/index.js';
import type {Agent} from '@/agent-core/agent/index.js';
import type {LlmConfig} from '@/agent-core/llm-api/index.js';
```

- [ ] **Step 2: Add subagent type constants and the explore agent type**

Replace the `subAgentInfos` constant and nearby `SubAgentType` / `agentTypeSchema` definitions with:

```typescript
export const SUB_AGENT_TYPE = {
  GENERAL: 'general',
  EXPLORE: 'explore',
} as const;

export type SubAgentType = (typeof SUB_AGENT_TYPE)[keyof typeof SUB_AGENT_TYPE];

const subAgentInfos = {
  [SUB_AGENT_TYPE.GENERAL]: {
    name: 'General',
    description:
      'General-purpose agent for autonomous multi-step tasks. ' +
      'Use for delegated work that no specialized subagent type covers.',
  },
  [SUB_AGENT_TYPE.EXPLORE]: {
    name: 'Explore',
    description:
      'Research-focused agent for gathering information, inspecting structure, ' +
      'tracing relationships, and returning an evidence-based report.',
  },
} as const satisfies Record<SubAgentType, SubAgentInfo>;

const agentTypeSchema = z.enum([
  SUB_AGENT_TYPE.GENERAL,
  SUB_AGENT_TYPE.EXPLORE,
]);
```

- [ ] **Step 3: Export the subagent factory**

Add this function after `buildToolDescription()` and before `const parameters = z.object({ ... })`:

```typescript
export function createSubAgent(
  agentType: SubAgentType,
  getConfig: () => Promise<LlmConfig>,
  workingDirectory: string,
): Agent {
  switch (agentType) {
    case SUB_AGENT_TYPE.GENERAL:
      return new GeneralSubAgent(getConfig, workingDirectory);
    case SUB_AGENT_TYPE.EXPLORE:
      return new ExploreSubAgent(getConfig, workingDirectory);
  }
}
```

- [ ] **Step 4: Use the factory in tool execution**

Replace:

```typescript
// Create subagent
const subagent: Agent = new GeneralSubAgent(getConfig, workingDirectory);
```

with:

```typescript
// Create subagent
const subagent = createSubAgent(agentType, getConfig, workingDirectory);
```

- [ ] **Step 5: Run the targeted test and verify only prompt-section expectations still fail**

Run:

```bash
bun run --filter '@omnicraft/backend' test -- src/agent/tools/sub-agent/dispatch-agent-tool.test.ts
```

Expected: FAIL only on `adds subagent dispatch guidance to the system prompt section`, because `SubAgentToolRegistry.getSystemPromptSection()` is not implemented yet.

---

### Task 4: Add Subagent Dispatch Prompt Guidance

**Files:**

- Modify: `apps/backend/src/agent/tools/sub-agent/sub-agent-tool-registry.ts`

- [ ] **Step 1: Add the prompt section method**

Replace `apps/backend/src/agent/tools/sub-agent/sub-agent-tool-registry.ts` with:

```typescript
import {ToolRegistry} from '@/agent-core/tool/index.js';

import {dispatchAgentTool, SUB_AGENT_TYPE} from './dispatch-agent-tool.js';

function buildGeneralDispatchGuidance(): string {
  return [
    '### General delegation',
    '',
    `- Use the \`${dispatchAgentTool.name}\` tool for delegated work that can proceed independently without blocking your immediate next local action.`,
    '- Keep very small local lookups local when dispatch overhead is not worth it.',
    '- After any subagent returns, synthesize its result for the user or use it to guide implementation.',
  ].join('\n');
}

function buildExploreDispatchGuidance(): string {
  return [
    '### Explore subagent',
    '',
    `- Prefer \`${SUB_AGENT_TYPE.EXPLORE}\` for repository research, including architecture, module design, cross-file behavior, call chains, data flow, historical context, dependency mapping, and impact analysis.`,
    '- Avoid spending main-agent context on broad file-reading research when an Explore report can answer the question.',
    '- When dispatching Explore, provide the question, scope, important constraints, and desired depth. Do not specify a report format unless the user asked for one.',
  ].join('\n');
}

/** Registry for subagent-related tools. */
export class SubAgentToolRegistry extends ToolRegistry {
  /** Creates the singleton and registers all subagent tools. */
  static override create(): SubAgentToolRegistry {
    const instance = super.create() as SubAgentToolRegistry;
    instance.register(dispatchAgentTool);
    return instance;
  }

  override getSystemPromptSection(): string {
    return [
      '## Subagent Dispatch',
      '',
      buildGeneralDispatchGuidance(),
      '',
      buildExploreDispatchGuidance(),
    ].join('\n');
  }
}
```

- [ ] **Step 2: Run the targeted test and verify it passes**

Run:

```bash
bun run --filter '@omnicraft/backend' test -- src/agent/tools/sub-agent/dispatch-agent-tool.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit the implementation and tests**

Run:

```bash
git add \
  apps/backend/src/agent/agents/explore-sub-agent/system-prompt.ts \
  apps/backend/src/agent/agents/explore-sub-agent/explore-sub-agent.ts \
  apps/backend/src/agent/agents/explore-sub-agent/index.ts \
  apps/backend/src/agent/agents/index.ts \
  apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts \
  apps/backend/src/agent/tools/sub-agent/sub-agent-tool-registry.ts \
  apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.test.ts
git commit -m "feat: add explore subagent"
```

---

### Task 5: Final Verification

**Files:**

- Verify: backend package checks

- [ ] **Step 1: Run backend typecheck**

Run:

```bash
bun run --filter '@omnicraft/backend' typecheck
```

Expected: PASS.

- [ ] **Step 2: Run the targeted backend test**

Run:

```bash
bun run --filter '@omnicraft/backend' test -- src/agent/tools/sub-agent/dispatch-agent-tool.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run the full backend test suite**

Run:

```bash
bun run --filter '@omnicraft/backend' test
```

Expected: PASS.

- [ ] **Step 4: Check the final diff**

Run:

```bash
git status --short
git diff --stat HEAD
```

Expected: no uncommitted implementation changes after the implementation commit, or only intentional plan checkbox updates if the executor tracked progress in this file.

---

## Self-Review

- Spec coverage: Tasks 2 and 3 add the Explore subagent type and wire it into `dispatch_agent`; Task 2 defines the soft read-only research/report prompt and report structure; Task 4 places delegation guidance in `SubAgentToolRegistry`; Task 5 verifies backend behavior.
- No frontend work is planned because the existing SSE metadata and subagent disclosure UI already display agent type, thinking level, and working directory.
- No hard read-only sandbox is planned because the approved design uses prompt-level behavior while retaining Bash.
