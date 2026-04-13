# Tool Parameter Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the raw JSON "Arguments" section in ToolExecutionCard with structured, per-tool parameter displays parsed from shared schemas.

**Architecture:** A new `ParametersSection` component replaces the `HighlightedJson` arguments block in `ToolExecutionCardView`. It parses the JSON arguments string with each tool's parameter schema via `safeParse`, dispatches to per-tool view components through `renderToolParameters`, and falls back to `HighlightedJson` on parse failure. A shared `ParameterRow` component handles consistent label+value layout across all tools.

**Tech Stack:** TypeScript, React, Zod (`safeParse`), `@omnicraft/tool-schemas`, CSS Modules

---

**Path shorthand:** `$CARD` = `apps/frontend/src/pages/chat/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard`

---

### Task 1: Create ParameterRow shared component

**Files:**

- Create: `$CARD/components/ParametersSection/components/ParameterRow/ParameterRowView.tsx`
- Create: `$CARD/components/ParametersSection/components/ParameterRow/styles.module.css`
- Create: `$CARD/components/ParametersSection/components/ParameterRow/index.ts`

- [ ] **Step 1: Create the styles**

Create `$CARD/components/ParametersSection/components/ParameterRow/styles.module.css`:

```css
.row {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  min-width: 80px;
  flex-shrink: 0;
}
```

- [ ] **Step 2: Create the view component**

Create `$CARD/components/ParametersSection/components/ParameterRow/ParameterRowView.tsx`:

```tsx
import type {ReactNode} from 'react';

import styles from './styles.module.css';

interface ParameterRowViewProps {
  label: string;
  children: ReactNode;
}

export function ParameterRowView({label, children}: ParameterRowViewProps) {
  return (
    <div className={styles.row}>
      <span className={styles.label}>{label}</span>
      {children}
    </div>
  );
}
```

- [ ] **Step 3: Create the index**

Create `$CARD/components/ParametersSection/components/ParameterRow/index.ts`:

```typescript
export {ParameterRowView as ParameterRow} from './ParameterRowView.js';
```

- [ ] **Step 4: Run typecheck**

Run: `cd apps/frontend && bunx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/chat/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/components/ParametersSection/
git commit -m "feat(frontend): add ParameterRow shared component for tool parameters"
```

---

### Task 2: Create per-tool parameter view components (read_file, write_file, edit_file)

**Files:**

- Create: `$CARD/components/ParametersSection/components/ReadFileParameters/ReadFileParametersView.tsx`
- Create: `$CARD/components/ParametersSection/components/ReadFileParameters/styles.module.css`
- Create: `$CARD/components/ParametersSection/components/ReadFileParameters/index.ts`
- Create: `$CARD/components/ParametersSection/components/WriteFileParameters/WriteFileParametersView.tsx`
- Create: `$CARD/components/ParametersSection/components/WriteFileParameters/styles.module.css`
- Create: `$CARD/components/ParametersSection/components/WriteFileParameters/index.ts`
- Create: `$CARD/components/ParametersSection/components/EditFileParameters/EditFileParametersView.tsx`
- Create: `$CARD/components/ParametersSection/components/EditFileParameters/styles.module.css`
- Create: `$CARD/components/ParametersSection/components/EditFileParameters/index.ts`

- [ ] **Step 1: Create ReadFileParameters**

Create `$CARD/components/ParametersSection/components/ReadFileParameters/styles.module.css`:

```css
.container {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.code {
  font-family: monospace;
  font-size: 0.8125rem;
  color: var(--foreground);
}
```

Create `$CARD/components/ParametersSection/components/ReadFileParameters/ReadFileParametersView.tsx`:

```tsx
import {ParameterRow} from '../ParameterRow/index.js';

import styles from './styles.module.css';

interface ReadFileParametersViewProps {
  filePath: string;
  startLine?: number;
  lineCount?: number;
}

export function ReadFileParametersView({
  filePath,
  startLine,
  lineCount,
}: ReadFileParametersViewProps) {
  return (
    <div className={styles.container}>
      <ParameterRow label='File'>
        <code className={styles.code}>{filePath}</code>
      </ParameterRow>
      {startLine !== undefined && (
        <ParameterRow label='Lines'>
          <span>
            {startLine}–
            {lineCount !== undefined ? startLine + lineCount - 1 : 'end'}
          </span>
        </ParameterRow>
      )}
    </div>
  );
}
```

Create `$CARD/components/ParametersSection/components/ReadFileParameters/index.ts`:

```typescript
export {ReadFileParametersView as ReadFileParameters} from './ReadFileParametersView.js';
```

- [ ] **Step 2: Create WriteFileParameters**

Create `$CARD/components/ParametersSection/components/WriteFileParameters/styles.module.css`:

```css
.container {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.code {
  font-family: monospace;
  font-size: 0.8125rem;
  color: var(--foreground);
}

.deferred {
  font-size: 0.8125rem;
  color: var(--muted);
  font-style: italic;
}
```

Create `$CARD/components/ParametersSection/components/WriteFileParameters/WriteFileParametersView.tsx`:

```tsx
import {ParameterRow} from '../ParameterRow/index.js';

import styles from './styles.module.css';

interface WriteFileParametersViewProps {
  filePath: string;
}

export function WriteFileParametersView({
  filePath,
}: WriteFileParametersViewProps) {
  return (
    <div className={styles.container}>
      <ParameterRow label='File'>
        <code className={styles.code}>{filePath}</code>
      </ParameterRow>
      <ParameterRow label='Content'>
        <span className={styles.deferred}>(shown in result below)</span>
      </ParameterRow>
    </div>
  );
}
```

Create `$CARD/components/ParametersSection/components/WriteFileParameters/index.ts`:

```typescript
export {WriteFileParametersView as WriteFileParameters} from './WriteFileParametersView.js';
```

- [ ] **Step 3: Create EditFileParameters**

Create `$CARD/components/ParametersSection/components/EditFileParameters/styles.module.css`:

```css
.container {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.code {
  font-family: monospace;
  font-size: 0.8125rem;
  color: var(--foreground);
}

.old {
  font-family: monospace;
  font-size: 0.8125rem;
  color: var(--danger);
  background: color-mix(in oklch, var(--danger) 10%, transparent);
  padding: 2px 6px;
  border-radius: 4px;
  white-space: pre-wrap;
  word-break: break-word;
}

.new {
  font-family: monospace;
  font-size: 0.8125rem;
  color: var(--success);
  background: color-mix(in oklch, var(--success) 10%, transparent);
  padding: 2px 6px;
  border-radius: 4px;
  white-space: pre-wrap;
  word-break: break-word;
}
```

Create `$CARD/components/ParametersSection/components/EditFileParameters/EditFileParametersView.tsx`:

```tsx
import {ParameterRow} from '../ParameterRow/index.js';

import styles from './styles.module.css';

interface EditFileParametersViewProps {
  filePath: string;
  oldString: string;
  newString: string;
  replaceAll?: boolean;
}

export function EditFileParametersView({
  filePath,
  oldString,
  newString,
  replaceAll,
}: EditFileParametersViewProps) {
  return (
    <div className={styles.container}>
      <ParameterRow label='File'>
        <code className={styles.code}>{filePath}</code>
      </ParameterRow>
      <ParameterRow label='Old'>
        <code className={styles.old}>{oldString}</code>
      </ParameterRow>
      <ParameterRow label='New'>
        <code className={styles.new}>{newString}</code>
      </ParameterRow>
      {replaceAll !== undefined && (
        <ParameterRow label='Replace all'>
          <span>{replaceAll ? 'Yes' : 'No'}</span>
        </ParameterRow>
      )}
    </div>
  );
}
```

Create `$CARD/components/ParametersSection/components/EditFileParameters/index.ts`:

```typescript
export {EditFileParametersView as EditFileParameters} from './EditFileParametersView.js';
```

- [ ] **Step 4: Run typecheck**

Run: `cd apps/frontend && bunx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/chat/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/components/ParametersSection/components/ReadFileParameters/ apps/frontend/src/pages/chat/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/components/ParametersSection/components/WriteFileParameters/ apps/frontend/src/pages/chat/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/components/ParametersSection/components/EditFileParameters/
git commit -m "feat(frontend): add ReadFile, WriteFile, EditFile parameter views"
```

---

### Task 3: Create per-tool parameter view components (find_files, search_files, run_command)

**Files:**

- Create: `$CARD/components/ParametersSection/components/FindFilesParameters/FindFilesParametersView.tsx`
- Create: `$CARD/components/ParametersSection/components/FindFilesParameters/styles.module.css`
- Create: `$CARD/components/ParametersSection/components/FindFilesParameters/index.ts`
- Create: `$CARD/components/ParametersSection/components/SearchFilesParameters/SearchFilesParametersView.tsx`
- Create: `$CARD/components/ParametersSection/components/SearchFilesParameters/styles.module.css`
- Create: `$CARD/components/ParametersSection/components/SearchFilesParameters/index.ts`
- Create: `$CARD/components/ParametersSection/components/RunCommandParameters/RunCommandParametersView.tsx`
- Create: `$CARD/components/ParametersSection/components/RunCommandParameters/styles.module.css`
- Create: `$CARD/components/ParametersSection/components/RunCommandParameters/index.ts`

- [ ] **Step 1: Create FindFilesParameters**

Create `$CARD/components/ParametersSection/components/FindFilesParameters/styles.module.css`:

```css
.container {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pattern {
  font-family: monospace;
  font-size: 0.8125rem;
  color: var(--accent);
}

.code {
  font-family: monospace;
  font-size: 0.8125rem;
  color: var(--foreground);
}
```

Create `$CARD/components/ParametersSection/components/FindFilesParameters/FindFilesParametersView.tsx`:

```tsx
import {ParameterRow} from '../ParameterRow/index.js';

import styles from './styles.module.css';

interface FindFilesParametersViewProps {
  pattern: string;
  path?: string;
}

export function FindFilesParametersView({
  pattern,
  path,
}: FindFilesParametersViewProps) {
  return (
    <div className={styles.container}>
      <ParameterRow label='Pattern'>
        <code className={styles.pattern}>{pattern}</code>
      </ParameterRow>
      {path !== undefined && (
        <ParameterRow label='Path'>
          <code className={styles.code}>{path}</code>
        </ParameterRow>
      )}
    </div>
  );
}
```

Create `$CARD/components/ParametersSection/components/FindFilesParameters/index.ts`:

```typescript
export {FindFilesParametersView as FindFilesParameters} from './FindFilesParametersView.js';
```

- [ ] **Step 2: Create SearchFilesParameters**

Create `$CARD/components/ParametersSection/components/SearchFilesParameters/styles.module.css`:

```css
.container {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pattern {
  font-family: monospace;
  font-size: 0.8125rem;
  color: var(--accent);
}

.code {
  font-family: monospace;
  font-size: 0.8125rem;
  color: var(--foreground);
}
```

Create `$CARD/components/ParametersSection/components/SearchFilesParameters/SearchFilesParametersView.tsx`:

```tsx
import {ParameterRow} from '../ParameterRow/index.js';

import styles from './styles.module.css';

interface SearchFilesParametersViewProps {
  pattern: string;
  path?: string;
  filePattern?: string;
}

export function SearchFilesParametersView({
  pattern,
  path,
  filePattern,
}: SearchFilesParametersViewProps) {
  return (
    <div className={styles.container}>
      <ParameterRow label='Pattern'>
        <code className={styles.pattern}>{pattern}</code>
      </ParameterRow>
      {path !== undefined && (
        <ParameterRow label='Path'>
          <code className={styles.code}>{path}</code>
        </ParameterRow>
      )}
      {filePattern !== undefined && (
        <ParameterRow label='File filter'>
          <code className={styles.code}>{filePattern}</code>
        </ParameterRow>
      )}
    </div>
  );
}
```

Create `$CARD/components/ParametersSection/components/SearchFilesParameters/index.ts`:

```typescript
export {SearchFilesParametersView as SearchFilesParameters} from './SearchFilesParametersView.js';
```

- [ ] **Step 3: Create RunCommandParameters**

Create `$CARD/components/ParametersSection/components/RunCommandParameters/styles.module.css`:

```css
.container {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.command {
  font-family: monospace;
  font-size: 0.8125rem;
  color: var(--foreground);
  background: var(--background);
  padding: 2px 8px;
  border-radius: 4px;
  white-space: pre-wrap;
  word-break: break-word;
}
```

Create `$CARD/components/ParametersSection/components/RunCommandParameters/RunCommandParametersView.tsx`:

```tsx
import {ParameterRow} from '../ParameterRow/index.js';

import styles from './styles.module.css';

interface RunCommandParametersViewProps {
  command: string;
  timeout?: number;
}

export function RunCommandParametersView({
  command,
  timeout,
}: RunCommandParametersViewProps) {
  return (
    <div className={styles.container}>
      <ParameterRow label='Command'>
        <code className={styles.command}>$ {command}</code>
      </ParameterRow>
      {timeout !== undefined && (
        <ParameterRow label='Timeout'>
          <span>{timeout / 1000}s</span>
        </ParameterRow>
      )}
    </div>
  );
}
```

Create `$CARD/components/ParametersSection/components/RunCommandParameters/index.ts`:

```typescript
export {RunCommandParametersView as RunCommandParameters} from './RunCommandParametersView.js';
```

- [ ] **Step 4: Run typecheck**

Run: `cd apps/frontend && bunx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/chat/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/components/ParametersSection/components/FindFilesParameters/ apps/frontend/src/pages/chat/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/components/ParametersSection/components/SearchFilesParameters/ apps/frontend/src/pages/chat/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/components/ParametersSection/components/RunCommandParameters/
git commit -m "feat(frontend): add FindFiles, SearchFiles, RunCommand parameter views"
```

---

### Task 4: Create per-tool parameter view components (web_search, web_fetch, web_fetch_raw, load_skill)

**Files:**

- Create: `$CARD/components/ParametersSection/components/WebSearchParameters/WebSearchParametersView.tsx`
- Create: `$CARD/components/ParametersSection/components/WebSearchParameters/styles.module.css`
- Create: `$CARD/components/ParametersSection/components/WebSearchParameters/index.ts`
- Create: `$CARD/components/ParametersSection/components/WebFetchParameters/WebFetchParametersView.tsx`
- Create: `$CARD/components/ParametersSection/components/WebFetchParameters/styles.module.css`
- Create: `$CARD/components/ParametersSection/components/WebFetchParameters/index.ts`
- Create: `$CARD/components/ParametersSection/components/WebFetchRawParameters/WebFetchRawParametersView.tsx`
- Create: `$CARD/components/ParametersSection/components/WebFetchRawParameters/styles.module.css`
- Create: `$CARD/components/ParametersSection/components/WebFetchRawParameters/index.ts`
- Create: `$CARD/components/ParametersSection/components/LoadSkillParameters/LoadSkillParametersView.tsx`
- Create: `$CARD/components/ParametersSection/components/LoadSkillParameters/styles.module.css`
- Create: `$CARD/components/ParametersSection/components/LoadSkillParameters/index.ts`

- [ ] **Step 1: Create WebSearchParameters**

Create `$CARD/components/ParametersSection/components/WebSearchParameters/styles.module.css`:

```css
.container {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
```

Create `$CARD/components/ParametersSection/components/WebSearchParameters/WebSearchParametersView.tsx`:

```tsx
import {ParameterRow} from '../ParameterRow/index.js';

import styles from './styles.module.css';

interface WebSearchParametersViewProps {
  query: string;
  maxResults?: number;
  includeDomains?: readonly string[];
  excludeDomains?: readonly string[];
}

export function WebSearchParametersView({
  query,
  maxResults,
  includeDomains,
  excludeDomains,
}: WebSearchParametersViewProps) {
  return (
    <div className={styles.container}>
      <ParameterRow label='Query'>
        <span>{query}</span>
      </ParameterRow>
      {maxResults !== undefined && (
        <ParameterRow label='Max results'>
          <span>{maxResults}</span>
        </ParameterRow>
      )}
      {includeDomains !== undefined && includeDomains.length > 0 && (
        <ParameterRow label='Domains'>
          <span>{includeDomains.join(', ')}</span>
        </ParameterRow>
      )}
      {excludeDomains !== undefined && excludeDomains.length > 0 && (
        <ParameterRow label='Exclude'>
          <span>{excludeDomains.join(', ')}</span>
        </ParameterRow>
      )}
    </div>
  );
}
```

Create `$CARD/components/ParametersSection/components/WebSearchParameters/index.ts`:

```typescript
export {WebSearchParametersView as WebSearchParameters} from './WebSearchParametersView.js';
```

- [ ] **Step 2: Create WebFetchParameters**

Create `$CARD/components/ParametersSection/components/WebFetchParameters/styles.module.css`:

```css
.container {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.url {
  font-family: monospace;
  font-size: 0.8125rem;
  color: var(--accent);
  text-decoration: none;
}
```

Create `$CARD/components/ParametersSection/components/WebFetchParameters/WebFetchParametersView.tsx`:

```tsx
import {ParameterRow} from '../ParameterRow/index.js';

import styles from './styles.module.css';

interface WebFetchParametersViewProps {
  url: string;
  includeFullPage?: boolean;
}

export function WebFetchParametersView({
  url,
  includeFullPage,
}: WebFetchParametersViewProps) {
  return (
    <div className={styles.container}>
      <ParameterRow label='URL'>
        <a
          className={styles.url}
          href={url}
          rel='noopener noreferrer'
          target='_blank'
        >
          {url}
        </a>
      </ParameterRow>
      {includeFullPage !== undefined && (
        <ParameterRow label='Full page'>
          <span>{includeFullPage ? 'Yes' : 'No'}</span>
        </ParameterRow>
      )}
    </div>
  );
}
```

Create `$CARD/components/ParametersSection/components/WebFetchParameters/index.ts`:

```typescript
export {WebFetchParametersView as WebFetchParameters} from './WebFetchParametersView.js';
```

- [ ] **Step 3: Create WebFetchRawParameters**

Create `$CARD/components/ParametersSection/components/WebFetchRawParameters/styles.module.css`:

```css
.container {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.url {
  font-family: monospace;
  font-size: 0.8125rem;
  color: var(--accent);
  text-decoration: none;
}
```

Create `$CARD/components/ParametersSection/components/WebFetchRawParameters/WebFetchRawParametersView.tsx`:

```tsx
import {ParameterRow} from '../ParameterRow/index.js';

import styles from './styles.module.css';

interface WebFetchRawParametersViewProps {
  url: string;
}

export function WebFetchRawParametersView({
  url,
}: WebFetchRawParametersViewProps) {
  return (
    <div className={styles.container}>
      <ParameterRow label='URL'>
        <a
          className={styles.url}
          href={url}
          rel='noopener noreferrer'
          target='_blank'
        >
          {url}
        </a>
      </ParameterRow>
    </div>
  );
}
```

Create `$CARD/components/ParametersSection/components/WebFetchRawParameters/index.ts`:

```typescript
export {WebFetchRawParametersView as WebFetchRawParameters} from './WebFetchRawParametersView.js';
```

- [ ] **Step 4: Create LoadSkillParameters**

Create `$CARD/components/ParametersSection/components/LoadSkillParameters/styles.module.css`:

```css
.container {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
```

Create `$CARD/components/ParametersSection/components/LoadSkillParameters/LoadSkillParametersView.tsx`:

```tsx
import {ParameterRow} from '../ParameterRow/index.js';

import styles from './styles.module.css';

interface LoadSkillParametersViewProps {
  name: string;
}

export function LoadSkillParametersView({name}: LoadSkillParametersViewProps) {
  return (
    <div className={styles.container}>
      <ParameterRow label='Skill'>
        <span>{name}</span>
      </ParameterRow>
    </div>
  );
}
```

Create `$CARD/components/ParametersSection/components/LoadSkillParameters/index.ts`:

```typescript
export {LoadSkillParametersView as LoadSkillParameters} from './LoadSkillParametersView.js';
```

- [ ] **Step 5: Run typecheck**

Run: `cd apps/frontend && bunx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/pages/chat/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/components/ParametersSection/components/WebSearchParameters/ apps/frontend/src/pages/chat/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/components/ParametersSection/components/WebFetchParameters/ apps/frontend/src/pages/chat/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/components/ParametersSection/components/WebFetchRawParameters/ apps/frontend/src/pages/chat/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/components/ParametersSection/components/LoadSkillParameters/
git commit -m "feat(frontend): add WebSearch, WebFetch, WebFetchRaw, LoadSkill parameter views"
```

---

### Task 5: Create renderToolParameters dispatcher and ParametersSection container

**Files:**

- Create: `$CARD/components/ParametersSection/helpers/renderToolParameters.tsx`
- Create: `$CARD/components/ParametersSection/ParametersSection.tsx`
- Create: `$CARD/components/ParametersSection/index.ts`

- [ ] **Step 1: Create renderToolParameters**

Create `$CARD/components/ParametersSection/helpers/renderToolParameters.tsx`:

```tsx
import type {ToolName} from '@omnicraft/tool-schemas';
import {
  editFileParametersSchema,
  findFilesParametersSchema,
  loadSkillParametersSchema,
  readFileParametersSchema,
  runCommandParametersSchema,
  searchFilesParametersSchema,
  webFetchParametersSchema,
  webFetchRawParametersSchema,
  webSearchParametersSchema,
  writeFileParametersSchema,
} from '@omnicraft/tool-schemas';
import type {ReactNode} from 'react';

import {EditFileParameters} from '../components/EditFileParameters/index.js';
import {FindFilesParameters} from '../components/FindFilesParameters/index.js';
import {LoadSkillParameters} from '../components/LoadSkillParameters/index.js';
import {ReadFileParameters} from '../components/ReadFileParameters/index.js';
import {RunCommandParameters} from '../components/RunCommandParameters/index.js';
import {SearchFilesParameters} from '../components/SearchFilesParameters/index.js';
import {WebFetchParameters} from '../components/WebFetchParameters/index.js';
import {WebFetchRawParameters} from '../components/WebFetchRawParameters/index.js';
import {WebSearchParameters} from '../components/WebSearchParameters/index.js';
import {WriteFileParameters} from '../components/WriteFileParameters/index.js';

export function renderToolParameters(
  toolName: ToolName,
  parsed: unknown,
): ReactNode | null {
  switch (toolName) {
    case 'read_file': {
      const d = readFileParametersSchema.parse(parsed);
      return (
        <ReadFileParameters
          filePath={d.filePath}
          lineCount={d.lineCount}
          startLine={d.startLine}
        />
      );
    }
    case 'write_file': {
      const d = writeFileParametersSchema.parse(parsed);
      return <WriteFileParameters filePath={d.filePath} />;
    }
    case 'edit_file': {
      const d = editFileParametersSchema.parse(parsed);
      return (
        <EditFileParameters
          filePath={d.filePath}
          newString={d.newString}
          oldString={d.oldString}
          replaceAll={d.replaceAll}
        />
      );
    }
    case 'find_files': {
      const d = findFilesParametersSchema.parse(parsed);
      return <FindFilesParameters path={d.path} pattern={d.pattern} />;
    }
    case 'search_files': {
      const d = searchFilesParametersSchema.parse(parsed);
      return (
        <SearchFilesParameters
          filePattern={d.filePattern}
          path={d.path}
          pattern={d.pattern}
        />
      );
    }
    case 'run_command': {
      const d = runCommandParametersSchema.parse(parsed);
      return <RunCommandParameters command={d.command} timeout={d.timeout} />;
    }
    case 'web_search': {
      const d = webSearchParametersSchema.parse(parsed);
      return (
        <WebSearchParameters
          excludeDomains={d.excludeDomains}
          includeDomains={d.includeDomains}
          maxResults={d.maxResults}
          query={d.query}
        />
      );
    }
    case 'web_fetch': {
      const d = webFetchParametersSchema.parse(parsed);
      return (
        <WebFetchParameters includeFullPage={d.includeFullPage} url={d.url} />
      );
    }
    case 'web_fetch_raw': {
      const d = webFetchRawParametersSchema.parse(parsed);
      return <WebFetchRawParameters url={d.url} />;
    }
    case 'load_skill': {
      const d = loadSkillParametersSchema.parse(parsed);
      return <LoadSkillParameters name={d.name} />;
    }
    case 'get_current_time':
    case 'ask_user':
      return null;
  }
}
```

- [ ] **Step 2: Create ParametersSection container**

Create `$CARD/components/ParametersSection/ParametersSection.tsx`:

```tsx
import type {ToolName} from '@omnicraft/tool-schemas';
import {useMemo} from 'react';

import {HighlightedJson} from '../HighlightedJson/index.js';

import {renderToolParameters} from './helpers/renderToolParameters.js';

interface ParametersSectionProps {
  toolName: ToolName;
  toolArguments: string;
}

export function ParametersSection({
  toolName,
  toolArguments,
}: ParametersSectionProps) {
  const content = useMemo(() => {
    try {
      const parsed: unknown = JSON.parse(toolArguments);
      const rendered = renderToolParameters(toolName, parsed);
      if (rendered !== null) {
        return rendered;
      }
    } catch {
      console.warn(
        `ParametersSection: failed to parse arguments for ${toolName}, falling back to raw JSON`,
      );
    }
    return <HighlightedJson jsonString={toolArguments} />;
  }, [toolName, toolArguments]);

  return content;
}
```

- [ ] **Step 3: Create the index**

Create `$CARD/components/ParametersSection/index.ts`:

```typescript
export {ParametersSection} from './ParametersSection.js';
```

- [ ] **Step 4: Run typecheck**

Run: `cd apps/frontend && bunx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/chat/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/components/ParametersSection/helpers/ apps/frontend/src/pages/chat/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/components/ParametersSection/ParametersSection.tsx apps/frontend/src/pages/chat/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/components/ParametersSection/index.ts
git commit -m "feat(frontend): add ParametersSection container and renderToolParameters dispatcher"
```

---

### Task 6: Integrate ParametersSection into ToolExecutionCardView

**Files:**

- Modify: `$CARD/ToolExecutionCardView.tsx`

- [ ] **Step 1: Replace HighlightedJson with ParametersSection**

In `$CARD/ToolExecutionCardView.tsx`, replace the arguments section (lines 57-66):

Old:

```tsx
import {HighlightedJson} from './components/HighlightedJson/index.js';
```

```tsx
<div className={styles.section}>
  <span className={styles.label}>Arguments</span>
  <ScrollShadow className={styles.pre}>
    <HighlightedJson jsonString={toolArguments} />
  </ScrollShadow>
</div>
```

New:

```tsx
import {ParametersSection} from './components/ParametersSection/index.js';
```

```tsx
<div className={styles.section}>
  <span className={styles.label}>Parameters</span>
  <ScrollShadow className={styles.pre}>
    <ParametersSection toolArguments={toolArguments} toolName={toolName} />
  </ScrollShadow>
</div>
```

Remove the `HighlightedJson` import if it is no longer used in this file (it is not — `ResultSectionView` imports it separately).

- [ ] **Step 2: Run typecheck**

Run: `cd apps/frontend && bunx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Run lint**

Run: `cd apps/frontend && bun run lint`
Expected: PASS (no unused imports, no errors)

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/pages/chat/components/StreamingMessageDisplay/components/MessageList/components/ToolExecutionCard/ToolExecutionCardView.tsx
git commit -m "feat(frontend): integrate ParametersSection into ToolExecutionCardView"
```

---

### Task 7: Manual smoke test

- [ ] **Step 1: Start the dev server**

Run: `cd apps/frontend && bun run dev`

- [ ] **Step 2: Verify parameter display**

Open the app in a browser, start a chat session, and trigger tool calls. Verify:

1. **read_file**: Shows "File" and optionally "Lines" rows instead of JSON
2. **write_file**: Shows "File" and "Content → (shown in result below)"
3. **edit_file**: Shows "File", red "Old", green "New", optionally "Replace all"
4. **find_files**: Shows "Pattern" (accent color) and optionally "Path"
5. **search_files**: Shows "Pattern", optionally "Path" and "File filter"
6. **run_command**: Shows "Command" with `$` prefix, optionally "Timeout"
7. **web_search**: Shows "Query", optionally "Max results", "Domains", "Exclude"
8. **web_fetch**: Shows "URL" as link, optionally "Full page"
9. **web_fetch_raw**: Shows "URL" as link
10. **load_skill**: Shows "Skill" name
11. **get_current_time / ask_user**: Falls back to raw JSON (no custom view)
12. **Fallback**: If arguments JSON is malformed, shows highlighted JSON
