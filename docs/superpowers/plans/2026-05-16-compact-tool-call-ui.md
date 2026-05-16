# Compact Tool Call UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle frontend tool execution cards into compact collapsed rows while preserving the existing expanded parameters/output/result details.

**Architecture:** Keep `ToolExecutionCard` as the only UI shell. Add a small `helpers/pill-content/` helper subtree where `getToolPillContent.ts` switches on `toolName` and delegates per-tool string formatting to focused adapters, matching the current `ResultSection/helpers/renderToolResult.tsx` style.

**Tech Stack:** Bun workspace, React 19, TypeScript, Vite, Vitest, CSS Modules, HeroUI `Disclosure` and `Spinner`, lucide-react status icons.

---

## File Structure

- Create `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/helpers/pill-content/types.ts`
  - Owns the `ToolExecutionPillContent` interface.
- Create `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/helpers/pill-content/fallbackToolPillContent.ts`
  - Provides safe fallback pill content when arguments cannot be parsed or an adapter throws.
- Create `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/helpers/pill-content/getToolPillContent.ts`
  - Public helper entry point. Parses JSON, switches by `toolName`, delegates to adapters, and falls back.
- Create `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/helpers/pill-content/getToolPillContent.test.ts`
  - Focused tests for adapter output and fallback behavior.
- Create `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/helpers/pill-content/adapters/*.ts`
  - One adapter per tool rendered through `ToolExecutionCard`.
- Create `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/ToolExecutionCardView.test.tsx`
  - View-level test proving the compact pill renders adapter content and shell-owned execution meta.
- Modify `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/ToolExecutionCardView.tsx`
  - Replace the current closed header content with compact pill content. Keep existing expanded details.
- Modify `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/styles.module.css`
  - Restyle the closed row, status states, pill target/detail/meta, and attached expanded body.

## Task 1: Add Tool-Owned Pill Content Helpers

**Files:**

- Create: `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/helpers/pill-content/types.ts`
- Create: `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/helpers/pill-content/fallbackToolPillContent.ts`
- Create: `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/helpers/pill-content/getToolPillContent.ts`
- Create: `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/helpers/pill-content/getToolPillContent.test.ts`
- Create: `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/helpers/pill-content/adapters/read-file.ts`
- Create: `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/helpers/pill-content/adapters/write-file.ts`
- Create: `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/helpers/pill-content/adapters/edit-file.ts`
- Create: `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/helpers/pill-content/adapters/find-files.ts`
- Create: `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/helpers/pill-content/adapters/search-files.ts`
- Create: `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/helpers/pill-content/adapters/run-command.ts`
- Create: `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/helpers/pill-content/adapters/web-search.ts`
- Create: `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/helpers/pill-content/adapters/web-fetch.ts`
- Create: `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/helpers/pill-content/adapters/web-fetch-raw.ts`
- Create: `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/helpers/pill-content/adapters/load-skill.ts`
- Create: `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/helpers/pill-content/adapters/get-current-time.ts`

- [ ] **Step 1: Write the failing helper test**

Create `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/helpers/pill-content/getToolPillContent.test.ts`:

```typescript
import type {ToolName} from '@omnicraft/tool-schemas';
import {describe, expect, it} from 'vitest';

import {getToolPillContent} from './getToolPillContent.js';
import type {ToolExecutionPillContent} from './types.js';

interface KnownToolCase {
  toolName: ToolName;
  displayName: string;
  toolArguments: string;
  expected: ToolExecutionPillContent;
}

const knownToolCases: KnownToolCase[] = [
  {
    toolName: 'read_file',
    displayName: 'Read File',
    toolArguments: JSON.stringify({filePath: 'src/App.tsx'}),
    expected: {
      action: 'Read',
      target: 'src/App.tsx',
      targetKind: 'code',
      detail: null,
    },
  },
  {
    toolName: 'write_file',
    displayName: 'Write File',
    toolArguments: JSON.stringify({filePath: 'src/App.tsx', content: 'x'}),
    expected: {
      action: 'Write',
      target: 'src/App.tsx',
      targetKind: 'code',
      detail: null,
    },
  },
  {
    toolName: 'edit_file',
    displayName: 'Edit File',
    toolArguments: JSON.stringify({
      filePath: 'src/App.tsx',
      oldString: 'old',
      newString: 'new',
    }),
    expected: {
      action: 'Edit',
      target: 'src/App.tsx',
      targetKind: 'code',
      detail: null,
    },
  },
  {
    toolName: 'find_files',
    displayName: 'Find Files',
    toolArguments: JSON.stringify({pattern: '**/*.tsx', path: 'src'}),
    expected: {
      action: 'Find',
      target: '**/*.tsx',
      targetKind: 'code',
      detail: 'src',
    },
  },
  {
    toolName: 'search_files',
    displayName: 'Search Files',
    toolArguments: JSON.stringify({
      pattern: 'ToolExecutionCard',
      filePattern: '**/*.tsx',
    }),
    expected: {
      action: 'Search',
      target: 'ToolExecutionCard',
      targetKind: 'code',
      detail: '**/*.tsx',
    },
  },
  {
    toolName: 'run_command',
    displayName: 'Run Command',
    toolArguments: JSON.stringify({command: 'bun test', timeout: 5000}),
    expected: {
      action: 'Command',
      target: 'bun test',
      targetKind: 'code',
      detail: '5s timeout',
    },
  },
  {
    toolName: 'web_search',
    displayName: 'Web Search',
    toolArguments: JSON.stringify({query: 'React Disclosure', maxResults: 8}),
    expected: {
      action: 'Search',
      target: 'React Disclosure',
      targetKind: 'text',
      detail: 'max 8',
    },
  },
  {
    toolName: 'web_fetch',
    displayName: 'Web Fetch',
    toolArguments: JSON.stringify({
      url: 'https://example.com/article',
      includeFullPage: true,
    }),
    expected: {
      action: 'Fetch',
      target: 'https://example.com/article',
      targetKind: 'code',
      detail: 'full page',
    },
  },
  {
    toolName: 'web_fetch_raw',
    displayName: 'Web Fetch Raw',
    toolArguments: JSON.stringify({url: 'https://example.com/raw'}),
    expected: {
      action: 'Fetch raw',
      target: 'https://example.com/raw',
      targetKind: 'code',
      detail: null,
    },
  },
  {
    toolName: 'load_skill',
    displayName: 'Load Skill',
    toolArguments: JSON.stringify({name: 'systematic-debugging'}),
    expected: {
      action: 'Skill',
      target: 'systematic-debugging',
      targetKind: 'text',
      detail: null,
    },
  },
  {
    toolName: 'get_current_time',
    displayName: 'Get Current Time',
    toolArguments: JSON.stringify({}),
    expected: {
      action: 'Time',
      target: 'current time',
      targetKind: 'text',
      detail: null,
    },
  },
];

describe('getToolPillContent', () => {
  it.each(knownToolCases)(
    'returns pill content for $toolName',
    ({toolName, displayName, toolArguments, expected}) => {
      expect(
        getToolPillContent({toolName, displayName, toolArguments}),
      ).toEqual(expected);
    },
  );

  it('falls back when arguments are malformed JSON', () => {
    expect(
      getToolPillContent({
        toolName: 'run_command',
        displayName: 'Run Command',
        toolArguments: '{',
      }),
    ).toEqual({
      action: 'Run Command',
      target: 'run_command',
      targetKind: 'code',
      detail: null,
    });
  });

  it('falls back when an adapter cannot validate arguments', () => {
    expect(
      getToolPillContent({
        toolName: 'read_file',
        displayName: 'Read File',
        toolArguments: JSON.stringify({startLine: 1}),
      }),
    ).toEqual({
      action: 'Read File',
      target: 'read_file',
      targetKind: 'code',
      detail: null,
    });
  });
});
```

- [ ] **Step 2: Run the helper test to verify it fails**

Run:

```bash
cd apps/frontend && bun test src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/helpers/pill-content/getToolPillContent.test.ts
```

Expected: FAIL with an import error for `./getToolPillContent.js` or `./types.js` because the helper files do not exist yet.

- [ ] **Step 3: Create the pill content types and fallback**

Create `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/helpers/pill-content/types.ts`:

```typescript
export interface ToolExecutionPillContent {
  action: string;
  target: string;
  targetKind: 'code' | 'text';
  detail: string | null;
}
```

Create `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/helpers/pill-content/fallbackToolPillContent.ts`:

```typescript
import type {ToolName} from '@omnicraft/tool-schemas';

import type {ToolExecutionPillContent} from './types.js';

interface FallbackToolPillContentInput {
  toolName: ToolName;
  displayName: string;
}

export function fallbackToolPillContent({
  toolName,
  displayName,
}: FallbackToolPillContentInput): ToolExecutionPillContent {
  return {
    action: displayName,
    target: toolName,
    targetKind: 'code',
    detail: null,
  };
}
```

- [ ] **Step 4: Create per-tool adapters**

Create `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/helpers/pill-content/adapters/read-file.ts`:

```typescript
import {readFileParametersSchema} from '@omnicraft/tool-schemas';

import type {ToolExecutionPillContent} from '../types.js';

export function getReadFilePillContent(
  parsed: unknown,
): ToolExecutionPillContent {
  const args = readFileParametersSchema.parse(parsed);
  return {
    action: 'Read',
    target: args.filePath,
    targetKind: 'code',
    detail: formatLineDetail(args.startLine, args.lineCount),
  };
}

function formatLineDetail(
  startLine: number | undefined,
  lineCount: number | undefined,
): string | null {
  if (startLine === undefined && lineCount === undefined) return null;
  if (startLine === undefined) return `${lineCount} lines`;
  if (lineCount === undefined) return `from line ${startLine}`;
  return `lines ${startLine}-${startLine + lineCount - 1}`;
}
```

Create `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/helpers/pill-content/adapters/write-file.ts`:

```typescript
import {writeFileParametersSchema} from '@omnicraft/tool-schemas';

import type {ToolExecutionPillContent} from '../types.js';

export function getWriteFilePillContent(
  parsed: unknown,
): ToolExecutionPillContent {
  const args = writeFileParametersSchema.parse(parsed);
  return {
    action: 'Write',
    target: args.filePath,
    targetKind: 'code',
    detail: null,
  };
}
```

Create `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/helpers/pill-content/adapters/edit-file.ts`:

```typescript
import {editFileParametersSchema} from '@omnicraft/tool-schemas';

import type {ToolExecutionPillContent} from '../types.js';

export function getEditFilePillContent(
  parsed: unknown,
): ToolExecutionPillContent {
  const args = editFileParametersSchema.parse(parsed);
  return {
    action: 'Edit',
    target: args.filePath,
    targetKind: 'code',
    detail: args.replaceAll ? 'replace all' : null,
  };
}
```

Create `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/helpers/pill-content/adapters/find-files.ts`:

```typescript
import {findFilesParametersSchema} from '@omnicraft/tool-schemas';

import type {ToolExecutionPillContent} from '../types.js';

export function getFindFilesPillContent(
  parsed: unknown,
): ToolExecutionPillContent {
  const args = findFilesParametersSchema.parse(parsed);
  return {
    action: 'Find',
    target: args.pattern,
    targetKind: 'code',
    detail: args.path ?? null,
  };
}
```

Create `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/helpers/pill-content/adapters/search-files.ts`:

```typescript
import {searchFilesParametersSchema} from '@omnicraft/tool-schemas';

import type {ToolExecutionPillContent} from '../types.js';

export function getSearchFilesPillContent(
  parsed: unknown,
): ToolExecutionPillContent {
  const args = searchFilesParametersSchema.parse(parsed);
  return {
    action: 'Search',
    target: args.pattern,
    targetKind: 'code',
    detail: args.filePattern ?? args.path ?? null,
  };
}
```

Create `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/helpers/pill-content/adapters/run-command.ts`:

```typescript
import {runCommandParametersSchema} from '@omnicraft/tool-schemas';

import type {ToolExecutionPillContent} from '../types.js';

export function getRunCommandPillContent(
  parsed: unknown,
): ToolExecutionPillContent {
  const args = runCommandParametersSchema.parse(parsed);
  return {
    action: 'Command',
    target: args.command,
    targetKind: 'code',
    detail:
      args.timeout === undefined ? null : `${args.timeout / 1000}s timeout`,
  };
}
```

Create `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/helpers/pill-content/adapters/web-search.ts`:

```typescript
import {webSearchParametersSchema} from '@omnicraft/tool-schemas';

import type {ToolExecutionPillContent} from '../types.js';

export function getWebSearchPillContent(
  parsed: unknown,
): ToolExecutionPillContent {
  const args = webSearchParametersSchema.parse(parsed);
  return {
    action: 'Search',
    target: args.query,
    targetKind: 'text',
    detail: args.maxResults === undefined ? null : `max ${args.maxResults}`,
  };
}
```

Create `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/helpers/pill-content/adapters/web-fetch.ts`:

```typescript
import {webFetchParametersSchema} from '@omnicraft/tool-schemas';

import type {ToolExecutionPillContent} from '../types.js';

export function getWebFetchPillContent(
  parsed: unknown,
): ToolExecutionPillContent {
  const args = webFetchParametersSchema.parse(parsed);
  return {
    action: 'Fetch',
    target: args.url,
    targetKind: 'code',
    detail: args.includeFullPage ? 'full page' : null,
  };
}
```

Create `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/helpers/pill-content/adapters/web-fetch-raw.ts`:

```typescript
import {webFetchRawParametersSchema} from '@omnicraft/tool-schemas';

import type {ToolExecutionPillContent} from '../types.js';

export function getWebFetchRawPillContent(
  parsed: unknown,
): ToolExecutionPillContent {
  const args = webFetchRawParametersSchema.parse(parsed);
  return {
    action: 'Fetch raw',
    target: args.url,
    targetKind: 'code',
    detail: null,
  };
}
```

Create `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/helpers/pill-content/adapters/load-skill.ts`:

```typescript
import {loadSkillParametersSchema} from '@omnicraft/tool-schemas';

import type {ToolExecutionPillContent} from '../types.js';

export function getLoadSkillPillContent(
  parsed: unknown,
): ToolExecutionPillContent {
  const args = loadSkillParametersSchema.parse(parsed);
  return {
    action: 'Skill',
    target: args.name,
    targetKind: 'text',
    detail: null,
  };
}
```

Create `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/helpers/pill-content/adapters/get-current-time.ts`:

```typescript
import type {ToolExecutionPillContent} from '../types.js';

export function getCurrentTimePillContent(): ToolExecutionPillContent {
  return {
    action: 'Time',
    target: 'current time',
    targetKind: 'text',
    detail: null,
  };
}
```

- [ ] **Step 5: Create the thin dispatcher**

Create `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/helpers/pill-content/getToolPillContent.ts`:

```typescript
import type {ToolName} from '@omnicraft/tool-schemas';

import {getCurrentTimePillContent} from './adapters/get-current-time.js';
import {getEditFilePillContent} from './adapters/edit-file.js';
import {getFindFilesPillContent} from './adapters/find-files.js';
import {getLoadSkillPillContent} from './adapters/load-skill.js';
import {getReadFilePillContent} from './adapters/read-file.js';
import {getRunCommandPillContent} from './adapters/run-command.js';
import {getSearchFilesPillContent} from './adapters/search-files.js';
import {getWebFetchRawPillContent} from './adapters/web-fetch-raw.js';
import {getWebFetchPillContent} from './adapters/web-fetch.js';
import {getWebSearchPillContent} from './adapters/web-search.js';
import {getWriteFilePillContent} from './adapters/write-file.js';
import {fallbackToolPillContent} from './fallbackToolPillContent.js';
import type {ToolExecutionPillContent} from './types.js';

interface GetToolPillContentInput {
  toolName: ToolName;
  displayName: string;
  toolArguments: string;
}

export function getToolPillContent(
  input: GetToolPillContentInput,
): ToolExecutionPillContent {
  try {
    const parsed: unknown = JSON.parse(input.toolArguments);
    return getKnownToolPillContent(input.toolName, parsed);
  } catch {
    return fallbackToolPillContent(input);
  }
}

function getKnownToolPillContent(
  toolName: ToolName,
  parsed: unknown,
): ToolExecutionPillContent {
  switch (toolName) {
    case 'read_file':
      return getReadFilePillContent(parsed);
    case 'write_file':
      return getWriteFilePillContent(parsed);
    case 'edit_file':
      return getEditFilePillContent(parsed);
    case 'find_files':
      return getFindFilesPillContent(parsed);
    case 'search_files':
      return getSearchFilesPillContent(parsed);
    case 'run_command':
      return getRunCommandPillContent(parsed);
    case 'web_search':
      return getWebSearchPillContent(parsed);
    case 'web_fetch':
      return getWebFetchPillContent(parsed);
    case 'web_fetch_raw':
      return getWebFetchRawPillContent(parsed);
    case 'load_skill':
      return getLoadSkillPillContent(parsed);
    case 'get_current_time':
      return getCurrentTimePillContent();
    case 'ask_user':
      throw new Error('ask_user does not render through ToolExecutionCard');
  }
}
```

- [ ] **Step 6: Run the helper test to verify it passes**

Run:

```bash
cd apps/frontend && bun test src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/helpers/pill-content/getToolPillContent.test.ts
```

Expected: PASS for all `getToolPillContent` tests.

- [ ] **Step 7: Commit the helper layer**

Run:

```bash
git add apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/helpers/pill-content
git commit -m "feat(frontend): add tool execution pill content helpers"
```

## Task 2: Integrate Compact Pill Row Into ToolExecutionCardView

**Files:**

- Create: `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/ToolExecutionCardView.test.tsx`
- Modify: `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/ToolExecutionCardView.tsx`
- Modify: `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/styles.module.css`

- [ ] **Step 1: Write the failing view test**

Create `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/ToolExecutionCardView.test.tsx`:

```tsx
import {render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';

import {ToolExecutionCardView} from './ToolExecutionCardView.js';

describe('ToolExecutionCardView', () => {
  it('renders adapter-owned pill content with success meta', () => {
    render(
      <ToolExecutionCardView
        toolName='run_command'
        displayName='Run Command'
        arguments={JSON.stringify({command: 'bun test'})}
        status='done'
        result='{}'
        data={{
          command: 'bun test',
          cwd: '/repo',
          exitCode: 0,
          timedOut: false,
          stdout: '',
          stderr: '',
        }}
      />,
    );

    expect(screen.getByText('Command')).toBeInTheDocument();
    expect(screen.getByText('bun test')).toBeInTheDocument();
    expect(screen.getByText('done')).toBeInTheDocument();
  });

  it('renders live output meta for a running tool with streamed output', () => {
    render(
      <ToolExecutionCardView
        toolName='run_command'
        displayName='Run Command'
        arguments={JSON.stringify({command: 'bun test'})}
        status='running'
        output='running tests...'
      />,
    );

    expect(screen.getByText('Command')).toBeInTheDocument();
    expect(screen.getByText('live output')).toBeInTheDocument();
  });

  it('keeps failures and errors visible in collapsed rows', () => {
    const {rerender} = render(
      <ToolExecutionCardView
        toolName='run_command'
        displayName='Run Command'
        arguments={JSON.stringify({command: 'exit 1'})}
        status='failure'
        result='Exit code: 1'
        data={{message: 'Exit code: 1'}}
      />,
    );

    expect(screen.getByText('failed')).toBeInTheDocument();

    rerender(
      <ToolExecutionCardView
        toolName='web_fetch'
        displayName='Web Fetch'
        arguments={JSON.stringify({url: 'https://example.com'})}
        status='error'
        result='Network error'
        data={{message: 'Network error'}}
      />,
    );

    expect(screen.getByText('error')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the view test to verify it fails**

Run:

```bash
cd apps/frontend && bun test src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/ToolExecutionCardView.test.tsx
```

Expected: FAIL because the current trigger renders `displayName` only and does not render compact pill action, target, or status meta.

- [ ] **Step 3: Update `ToolExecutionCardView.tsx`**

Replace `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/ToolExecutionCardView.tsx` with:

```tsx
import {Disclosure, ScrollShadow, Spinner} from '@heroui/react';
import type {AnyToolResultData, ToolName} from '@omnicraft/tool-schemas';
import clsx from 'clsx';
import {CircleAlert, CircleCheck, CircleX} from 'lucide-react';

import {ParametersSection} from './components/ParametersSection/index.js';
import {ResultSection} from './components/ResultSection/index.js';
import {getToolPillContent} from './helpers/pill-content/getToolPillContent.js';
import styles from './styles.module.css';

interface ToolExecutionCardViewProps {
  toolName: ToolName;
  displayName: string;
  arguments: string;
  status: 'running' | 'done' | 'failure' | 'error';
  result?: string;
  output?: string;
  data?: AnyToolResultData;
}

const STATUS_ICON_SIZE = 16;

export function ToolExecutionCardView({
  toolName,
  displayName,
  arguments: toolArguments,
  status,
  result,
  output,
  data,
}: ToolExecutionCardViewProps) {
  const pillContent = getToolPillContent({
    toolName,
    displayName,
    toolArguments,
  });
  const executionMeta = getExecutionMeta(status, output);

  return (
    <div
      className={clsx(styles.card, {
        [styles.cardRunning]: status === 'running',
        [styles.cardDone]: status === 'done',
        [styles.cardFailure]: status === 'failure',
        [styles.cardError]: status === 'error',
      })}
    >
      <Disclosure>
        <Disclosure.Heading>
          <Disclosure.Trigger className={styles.trigger}>
            <span className={styles.srOnly}>Status: {executionMeta}</span>
            {status === 'running' && (
              <Spinner className={styles.spinner} size='sm' />
            )}
            {status === 'done' && (
              <CircleCheck
                aria-hidden='true'
                className={styles.statusDone}
                size={STATUS_ICON_SIZE}
              />
            )}
            {status === 'failure' && (
              <CircleAlert
                aria-hidden='true'
                className={styles.statusFailure}
                size={STATUS_ICON_SIZE}
              />
            )}
            {status === 'error' && (
              <CircleX
                aria-hidden='true'
                className={styles.statusError}
                size={STATUS_ICON_SIZE}
              />
            )}
            <span className={styles.action}>{pillContent.action}</span>
            <span
              className={clsx(styles.target, {
                [styles.targetCode]: pillContent.targetKind === 'code',
              })}
            >
              {pillContent.target}
            </span>
            {pillContent.detail !== null && (
              <span className={styles.detail}>{pillContent.detail}</span>
            )}
            <span className={styles.meta}>{executionMeta}</span>
            <Disclosure.Indicator />
          </Disclosure.Trigger>
        </Disclosure.Heading>
        <Disclosure.Content>
          <Disclosure.Body className={styles.body}>
            <div className={styles.section}>
              <span className={styles.label}>Tool</span>
              <code className={styles.code}>{toolName}</code>
            </div>
            <div className={styles.section}>
              <span className={styles.label}>Parameters</span>
              <ScrollShadow className={styles.pre}>
                <ParametersSection
                  toolArguments={toolArguments}
                  toolName={toolName}
                />
              </ScrollShadow>
            </div>
            {output !== undefined && result === undefined && (
              <div className={styles.section}>
                <span className={styles.label}>Output</span>
                <ScrollShadow className={styles.pre}>{output}</ScrollShadow>
              </div>
            )}
            <ResultSection
              data={data}
              result={result}
              status={status}
              toolArguments={toolArguments}
              toolName={toolName}
            />
          </Disclosure.Body>
        </Disclosure.Content>
      </Disclosure>
    </div>
  );
}

function getExecutionMeta(
  status: ToolExecutionCardViewProps['status'],
  output: string | undefined,
): string {
  if (status === 'running') return output ? 'live output' : 'running';
  if (status === 'done') return 'done';
  if (status === 'failure') return 'failed';
  return 'error';
}
```

- [ ] **Step 4: Replace `styles.module.css`**

Replace `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/styles.module.css` with:

```css
.card {
  width: min(520px, 100%);
  max-width: 100%;
  border-radius: 10px;
  border: 1px solid transparent;
  overflow: hidden;
}

.cardRunning {
  background: color-mix(in oklch, var(--accent) 7%, transparent);
  border-color: color-mix(in oklch, var(--accent) 18%, transparent);
}

.cardDone {
  opacity: 0.78;
}

.cardDone:hover,
.cardDone:focus-within {
  opacity: 1;
}

.cardFailure {
  background: color-mix(in oklch, var(--warning) 8%, transparent);
  border-color: color-mix(in oklch, var(--warning) 22%, transparent);
}

.cardError {
  background: color-mix(in oklch, var(--danger) 8%, transparent);
  border-color: color-mix(in oklch, var(--danger) 22%, transparent);
}

.trigger {
  display: grid;
  grid-template-columns: 16px auto minmax(0, 1fr) auto auto 16px;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 32px;
  padding: 5px 8px;
  cursor: pointer;
  background: none;
  border: none;
  color: inherit;
  font: inherit;
  text-align: left;
}

.trigger:hover {
  background: color-mix(in oklch, var(--foreground) 5%, transparent);
}

.spinner {
  width: 16px;
  height: 16px;
}

.statusDone {
  color: var(--success);
  flex-shrink: 0;
}

.statusFailure {
  color: var(--warning);
  flex-shrink: 0;
}

.statusError {
  color: var(--danger);
  flex-shrink: 0;
}

.action {
  color: var(--foreground);
  font-size: 0.8125rem;
  font-weight: 650;
  white-space: nowrap;
}

.target {
  min-width: 0;
  overflow: hidden;
  color: var(--muted);
  font-size: 0.8125rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.targetCode {
  font-family: ui-monospace, 'SF Mono', 'Fira Code', monospace;
}

.detail,
.meta {
  color: var(--muted);
  font-size: 0.75rem;
  white-space: nowrap;
}

.meta {
  justify-self: end;
}

.body {
  padding: 8px 10px 10px 32px;
  border-top: 1px solid color-mix(in oklch, var(--border) 70%, transparent);
  background: color-mix(in oklch, var(--surface) 75%, transparent);
}

.section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.section + .section {
  margin-top: 8px;
}

.label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.code {
  font-family: monospace;
  font-size: 0.8125rem;
  color: var(--foreground);
}

.pre {
  margin: 0;
  padding: 8px;
  background: var(--background);
  border-radius: 6px;
  font-size: 0.8125rem;
  line-height: 1.5;
  max-height: 200px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.srOnly {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

- [ ] **Step 5: Run the view test to verify it passes**

Run:

```bash
cd apps/frontend && bun test src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/ToolExecutionCardView.test.tsx
```

Expected: PASS for all `ToolExecutionCardView` tests.

- [ ] **Step 6: Run the focused helper and view tests together**

Run:

```bash
cd apps/frontend && bun test src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/helpers/pill-content/getToolPillContent.test.ts src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/ToolExecutionCardView.test.tsx
```

Expected: PASS for both focused test files.

- [ ] **Step 7: Commit the UI integration**

Run:

```bash
git add apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard
git commit -m "feat(frontend): compact tool execution rows"
```

## Task 3: Final Verification

**Files:**

- Verify: frontend tests, lint, and production build.

- [ ] **Step 1: Run the focused test suite**

Run:

```bash
cd apps/frontend && bun test src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/helpers/pill-content/getToolPillContent.test.ts src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/ToolExecutionCardView.test.tsx
```

Expected: PASS for the pill helper and view tests.

- [ ] **Step 2: Run frontend lint**

Run:

```bash
cd apps/frontend && bun run lint
```

Expected: PASS with no ESLint errors.

- [ ] **Step 3: Run frontend build**

Run:

```bash
cd apps/frontend && bun run build
```

Expected: TypeScript and Vite production build complete successfully.

- [ ] **Step 4: Inspect git status**

Run:

```bash
git status --short
```

Expected: clean working tree after the implementation commits.
