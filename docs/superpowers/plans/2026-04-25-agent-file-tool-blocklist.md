# Agent File Tool Blocklist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a default sensitive-path blocklist to agent file tools and workspace validation.

**Architecture:** Create one shared backend policy helper in `apps/backend/src/helpers/sensitive-path-policy.ts` so both agent file tools and file-access settings validation use the same rules. Direct file tools fail blocked operations with the standard policy message; broad search tools skip blocked/symlinked entries and append a policy note. Workspace settings reject a blocked workspace root with `PathValidationError.BLOCKED`.

**Tech Stack:** TypeScript, Node.js `fs/promises`, `path`, `os`, fast-glob, Vitest, Bun workspace scripts.

---

## File Structure

- Create: `apps/backend/src/helpers/sensitive-path-policy.ts`
  - Owns default blocked root construction, basename/pattern checks, lexical checks, realpath checks, nearest-existing-parent checks for new writes, symlink detection, and standard messages.
- Create: `apps/backend/src/helpers/sensitive-path-policy.test.ts`
  - Unit tests for all policy rules and symlink/nearest-parent behavior.
- Modify: `apps/backend/src/agent/tools/file/read-file.ts`
  - Calls policy before reading blocked paths.
- Modify: `apps/backend/src/agent/tools/file/write-file.ts`
  - Calls policy before writing existing or new blocked paths.
- Modify: `apps/backend/src/agent/tools/file/edit-file.ts`
  - Calls policy before reading or writing blocked paths.
- Modify: `apps/backend/src/agent/tools/file/find-files.ts`
  - Disables symlink following, checks search root, skips symlinked/blocked results, appends policy note.
- Modify: `apps/backend/src/agent/tools/file/search-files.ts`
  - Disables symlink following, checks search root, skips symlinked/blocked files, appends policy note.
- Modify: file tool tests under `apps/backend/src/agent/tools/file/*.test.ts`
  - Adds integration coverage for policy failures/skips.
- Modify: `apps/backend/src/services/file-access-settings/types.ts`
  - Adds `PathValidationError.BLOCKED`.
- Modify: `apps/backend/src/services/file-access-settings/helpers.ts`
  - Rejects blocked workspace roots using shared policy.
- Modify: `apps/backend/src/services/file-access-settings/helpers.test.ts`
  - Adds workspace validation coverage.

Run backend commands from the repo root with Bun filters, for example:

```bash
bun run --filter '@omnicraft/backend' test -- src/helpers/sensitive-path-policy.test.ts
```

---

### Task 1: Add Sensitive Path Policy Helper

**Files:**

- Create: `apps/backend/src/helpers/sensitive-path-policy.ts`
- Create: `apps/backend/src/helpers/sensitive-path-policy.test.ts`

- [ ] **Step 1: Write the failing policy tests**

Create `apps/backend/src/helpers/sensitive-path-policy.test.ts`:

```ts
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {
  checkExistingPathAccess,
  checkLexicalPathAccess,
  checkNewPathAccess,
  FILE_ACCESS_POLICY_SKIPPED_MESSAGE,
  formatFileAccessPolicyDeniedMessage,
  isSymbolicLinkPath,
} from './sensitive-path-policy.js';

describe('sensitive-path-policy', () => {
  let tempDir: string;
  let homeDir: string;
  let dataDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'spp-test-'));
    homeDir = path.join(tempDir, 'home');
    dataDir = path.join(tempDir, 'data');
    await fs.mkdir(homeDir, {recursive: true});
    await fs.mkdir(dataDir, {recursive: true});
  });

  afterEach(async () => {
    await fs.rm(tempDir, {recursive: true, force: true});
  });

  function options() {
    return {homeDir, dataDir};
  }

  it('exports standard policy messages', () => {
    expect(formatFileAccessPolicyDeniedMessage('/blocked')).toBe(
      'Error: Access denied by file access policy: /blocked. This operation would access a blocked sensitive path. Review the file access operation. If this operation is necessary, stop and ask the user to perform it manually.',
    );
    expect(FILE_ACCESS_POLICY_SKIPPED_MESSAGE).toBe(
      'Some paths were skipped because they are blocked by file access policy. Do not try to bypass this policy. If accessing those paths is necessary, stop and ask the user to perform the operation manually.',
    );
  });

  it('blocks configured home sensitive roots and app data dir', () => {
    const sshKey = path.join(homeDir, '.ssh', 'id_ed25519');
    const appSettings = path.join(dataDir, 'settings.json');

    expect(checkLexicalPathAccess(sshKey, options()).allowed).toBe(false);
    expect(checkLexicalPathAccess(appSettings, options()).allowed).toBe(false);
  });

  it('blocks VCS metadata segments but not sibling ignore files', () => {
    const gitConfig = path.join(tempDir, 'project', '.git', 'config');
    const gitignore = path.join(tempDir, 'project', '.gitignore');

    expect(checkLexicalPathAccess(gitConfig, options()).allowed).toBe(false);
    expect(checkLexicalPathAccess(gitignore, options()).allowed).toBe(true);
  });

  it('blocks env files except examples', () => {
    expect(
      checkLexicalPathAccess(path.join(tempDir, '.env'), options()).allowed,
    ).toBe(false);
    expect(
      checkLexicalPathAccess(path.join(tempDir, '.env.local'), options())
        .allowed,
    ).toBe(false);
    expect(
      checkLexicalPathAccess(path.join(tempDir, '.env.example'), options())
        .allowed,
    ).toBe(true);
    expect(
      checkLexicalPathAccess(path.join(tempDir, '.env.sample'), options())
        .allowed,
    ).toBe(true);
    expect(
      checkLexicalPathAccess(path.join(tempDir, '.env.template'), options())
        .allowed,
    ).toBe(true);
  });

  it('blocks credential filenames and private key extensions', () => {
    const blocked = [
      '.netrc',
      '.git-credentials',
      '.npmrc',
      '.pypirc',
      '.pgpass',
      '.my.cnf',
      '.bash_history',
      '.zsh_history',
      'credentials.json',
      'server.pem',
      'server.key',
      'cert.p12',
      'cert.pfx',
      'id_rsa',
      'id_ed25519',
      'my-service-account-prod.json',
    ];

    for (const basename of blocked) {
      expect(
        checkLexicalPathAccess(path.join(tempDir, basename), options()).allowed,
      ).toBe(false);
    }
  });

  it('detects symbolic links', async () => {
    const target = path.join(tempDir, 'target.txt');
    const link = path.join(tempDir, 'link.txt');
    await fs.writeFile(target, 'content');
    await fs.symlink(target, link);

    expect(await isSymbolicLinkPath(link)).toBe(true);
    expect(await isSymbolicLinkPath(target)).toBe(false);
  });

  it('blocks existing paths whose real target is blocked', async () => {
    const envFile = path.join(tempDir, '.env');
    const link = path.join(tempDir, 'env-link');
    await fs.writeFile(envFile, 'SECRET=value');
    await fs.symlink(envFile, link);

    const result = await checkExistingPathAccess(link, options());

    expect(result.allowed).toBe(false);
    expect(result.allowed ? '' : result.message).toContain(
      'Access denied by file access policy',
    );
  });

  it('blocks new paths through a symlinked parent when only the real target is blocked', async () => {
    const linkToData = path.join(tempDir, 'link-to-data');
    await fs.symlink(dataDir, linkToData, 'dir');

    const result = await checkNewPathAccess(
      path.join(linkToData, 'new-settings.json'),
      options(),
    );

    expect(result.allowed).toBe(false);
  });
});
```

- [ ] **Step 2: Run policy tests to verify they fail**

Run:

```bash
bun run --filter '@omnicraft/backend' test -- src/helpers/sensitive-path-policy.test.ts
```

Expected: FAIL because `./sensitive-path-policy.js` does not exist.

- [ ] **Step 3: Implement the policy helper**

Create `apps/backend/src/helpers/sensitive-path-policy.ts`:

```ts
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {getDataDir} from './env.js';
import {isSubPathOrSelf} from './path-helpers.js';

export const FILE_ACCESS_POLICY_SKIPPED_MESSAGE =
  'Some paths were skipped because they are blocked by file access policy. ' +
  'Do not try to bypass this policy. If accessing those paths is necessary, ' +
  'stop and ask the user to perform the operation manually.';

export function formatFileAccessPolicyDeniedMessage(filePath: string): string {
  return (
    `Error: Access denied by file access policy: ${filePath}. ` +
    'This operation would access a blocked sensitive path. ' +
    'Review the file access operation. If this operation is necessary, ' +
    'stop and ask the user to perform it manually.'
  );
}

export type FileAccessPolicyResult =
  | {allowed: true}
  | {allowed: false; message: string};

export interface SensitivePathPolicyOptions {
  readonly homeDir?: string;
  readonly dataDir?: string;
}

const BLOCKED_HOME_RELATIVE_ROOTS = [
  '.ssh',
  '.gnupg',
  '.pki',
  '.aws',
  '.azure',
  path.join('.config', 'gcloud'),
  path.join('.config', 'gh'),
  '.kube',
  '.docker',
  '.terraform.d',
  path.join('Library', 'Keychains'),
  path.join('Library', 'Application Support', 'Google', 'Chrome'),
  path.join('Library', 'Application Support', 'Chromium'),
  path.join('Library', 'Application Support', 'BraveSoftware'),
  path.join('Library', 'Application Support', 'Firefox'),
] as const;

const BLOCKED_PATH_SEGMENTS = new Set(['.git', '.hg', '.svn']);

const BLOCKED_BASENAMES = new Set([
  '.netrc',
  '.git-credentials',
  '.npmrc',
  '.pypirc',
  '.pgpass',
  '.my.cnf',
  '.bash_history',
  '.zsh_history',
  '.fish_history',
  '.psql_history',
  '.mysql_history',
  '.sqlite_history',
  'credentials.json',
  'id_rsa',
  'id_dsa',
  'id_ecdsa',
  'id_ed25519',
]);

const BLOCKED_EXTENSIONS = new Set(['.pem', '.key', '.p12', '.pfx']);
const ALLOWED_ENV_BASENAMES = new Set([
  '.env.example',
  '.env.sample',
  '.env.template',
]);

function getPolicyRoots(options: SensitivePathPolicyOptions = {}): string[] {
  const homeDir = path.resolve(options.homeDir ?? os.homedir());
  const dataDir = path.resolve(options.dataDir ?? getDataDir());
  return [
    dataDir,
    ...BLOCKED_HOME_RELATIVE_ROOTS.map((relativeRoot) =>
      path.resolve(homeDir, relativeRoot),
    ),
  ];
}

function hasBlockedSegment(absolutePath: string): boolean {
  return path
    .resolve(absolutePath)
    .split(path.sep)
    .some((segment) => BLOCKED_PATH_SEGMENTS.has(segment));
}

function hasBlockedBasename(absolutePath: string): boolean {
  const basename = path.basename(absolutePath).toLowerCase();
  if (ALLOWED_ENV_BASENAMES.has(basename)) return false;
  if (basename === '.env' || basename.startsWith('.env.')) return true;
  if (BLOCKED_BASENAMES.has(basename)) return true;
  if (BLOCKED_EXTENSIONS.has(path.extname(basename))) return true;
  return basename.endsWith('.json') && basename.includes('service-account');
}

function isBlockedPath(
  absolutePath: string,
  options: SensitivePathPolicyOptions = {},
): boolean {
  const resolvedPath = path.resolve(absolutePath);
  if (hasBlockedSegment(resolvedPath)) return true;
  if (hasBlockedBasename(resolvedPath)) return true;
  return getPolicyRoots(options).some((root) =>
    isSubPathOrSelf(root, resolvedPath),
  );
}

function denied(absolutePath: string): FileAccessPolicyResult {
  return {
    allowed: false,
    message: formatFileAccessPolicyDeniedMessage(absolutePath),
  };
}

export function checkLexicalPathAccess(
  absolutePath: string,
  options: SensitivePathPolicyOptions = {},
): FileAccessPolicyResult {
  const resolvedPath = path.resolve(absolutePath);
  if (isBlockedPath(resolvedPath, options)) return denied(resolvedPath);
  return {allowed: true};
}

export async function checkExistingPathAccess(
  absolutePath: string,
  options: SensitivePathPolicyOptions = {},
): Promise<FileAccessPolicyResult> {
  const lexical = checkLexicalPathAccess(absolutePath, options);
  if (!lexical.allowed) return lexical;
  const realPath = await fs.realpath(absolutePath);
  const real = checkLexicalPathAccess(realPath, options);
  if (!real.allowed) return denied(path.resolve(absolutePath));
  return {allowed: true};
}

async function findNearestExistingParent(absolutePath: string): Promise<{
  existingParent: string;
  suffixParts: string[];
}> {
  const resolvedPath = path.resolve(absolutePath);
  const suffixParts: string[] = [];
  let current = resolvedPath;

  while (true) {
    try {
      const stat = await fs.stat(current);
      if (stat.isDirectory()) return {existingParent: current, suffixParts};
      return {
        existingParent: path.dirname(current),
        suffixParts: [path.basename(current), ...suffixParts],
      };
    } catch {
      const parent = path.dirname(current);
      suffixParts.unshift(path.basename(current));
      if (parent === current) return {existingParent: current, suffixParts: []};
      current = parent;
    }
  }
}

export async function checkNewPathAccess(
  absolutePath: string,
  options: SensitivePathPolicyOptions = {},
): Promise<FileAccessPolicyResult> {
  const lexical = checkLexicalPathAccess(absolutePath, options);
  if (!lexical.allowed) return lexical;

  const {existingParent, suffixParts} =
    await findNearestExistingParent(absolutePath);
  const realParent = await fs.realpath(existingParent);
  const reconstructedTarget = path.join(realParent, ...suffixParts);
  const real = checkLexicalPathAccess(reconstructedTarget, options);
  if (!real.allowed) return denied(path.resolve(absolutePath));
  return {allowed: true};
}

export async function isSymbolicLinkPath(
  absolutePath: string,
): Promise<boolean> {
  try {
    return (await fs.lstat(absolutePath)).isSymbolicLink();
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run policy tests to verify they pass**

Run:

```bash
bun run --filter '@omnicraft/backend' test -- src/helpers/sensitive-path-policy.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit policy helper**

```bash
git add apps/backend/src/helpers/sensitive-path-policy.ts apps/backend/src/helpers/sensitive-path-policy.test.ts
git commit -m "feat: add sensitive path policy helper"
```

---

### Task 2: Enforce Policy in Direct File Tools

**Files:**

- Modify: `apps/backend/src/agent/tools/file/read-file.ts`
- Modify: `apps/backend/src/agent/tools/file/write-file.ts`
- Modify: `apps/backend/src/agent/tools/file/edit-file.ts`
- Test: `apps/backend/src/agent/tools/file/read-file.test.ts`
- Test: `apps/backend/src/agent/tools/file/write-file.test.ts`
- Test: `apps/backend/src/agent/tools/file/edit-file.test.ts`

- [ ] **Step 1: Write failing `read_file` policy tests**

Append inside `describe('error cases', ...)` in `apps/backend/src/agent/tools/file/read-file.test.ts`:

```ts
it('denies blocked direct paths before reading', async () => {
  await writeFile('.env', 'SECRET=value');

  const result = await readFileTool.execute({filePath: '.env'}, context);

  expect(result.status).toBe('failure');
  assert(result.status === 'failure');
  expect(result.content).toContain('Access denied by file access policy');
  expect(result.content).toContain('Review the file access operation');
  expect(result.content).toContain('ask the user to perform it manually');
});

it('denies symlink paths whose real target is blocked', async () => {
  const target = await writeFile('.env.local', 'SECRET=value');
  const link = path.join(tmpDir, 'env-link');
  await fs.symlink(target, link);

  const result = await readFileTool.execute({filePath: 'env-link'}, context);

  expect(result.status).toBe('failure');
  assert(result.status === 'failure');
  expect(result.content).toContain('Access denied by file access policy');
});
```

- [ ] **Step 2: Write failing `write_file` policy tests**

Append inside `describe('error cases', ...)` in `apps/backend/src/agent/tools/file/write-file.test.ts`:

```ts
it('denies writing a new blocked path', async () => {
  const result = await writeFileTool.execute(
    {filePath: '.env.local', content: 'SECRET=value'},
    context,
  );

  expect(result.status).toBe('failure');
  assert(result.status === 'failure');
  expect(result.content).toContain('Access denied by file access policy');
  await expect(fs.stat(path.join(tmpDir, '.env.local'))).rejects.toThrow();
});

it('denies overwriting an existing blocked path', async () => {
  const filePath = path.join(tmpDir, '.env');
  await fs.writeFile(filePath, 'old');
  context.fileStatTracker.set(filePath, 3, (await fs.stat(filePath)).mtimeMs);

  const result = await writeFileTool.execute(
    {filePath: '.env', content: 'new'},
    context,
  );

  expect(result.status).toBe('failure');
  assert(result.status === 'failure');
  expect(result.content).toContain('Access denied by file access policy');
  await expect(fs.readFile(filePath, 'utf-8')).resolves.toBe('old');
});

it('denies new writes through a symlinked parent to a blocked real target', async () => {
  const realProject = path.join(tmpDir, 'real-project');
  const linkProject = path.join(tmpDir, 'link-project');
  await fs.mkdir(path.join(realProject, '.git'), {recursive: true});
  await fs.symlink(realProject, linkProject, 'dir');

  const result = await writeFileTool.execute(
    {filePath: 'link-project/.git/new-config', content: 'content'},
    context,
  );

  expect(result.status).toBe('failure');
  assert(result.status === 'failure');
  expect(result.content).toContain('Access denied by file access policy');
});
```

- [ ] **Step 3: Write failing `edit_file` policy test**

Append inside `describe('error cases', ...)` in `apps/backend/src/agent/tools/file/edit-file.test.ts`:

```ts
it('denies editing blocked direct paths before reading content', async () => {
  const filePath = await writeFile('.env', 'SECRET=old');
  const stat = await fs.stat(filePath);
  context.fileStatTracker.set(filePath, stat.size, stat.mtimeMs);

  const result = await editFileTool.execute(
    {filePath: '.env', oldString: 'old', newString: 'new'},
    context,
  );

  expect(result.status).toBe('failure');
  assert(result.status === 'failure');
  expect(result.content).toContain('Access denied by file access policy');
  await expect(fs.readFile(filePath, 'utf-8')).resolves.toBe('SECRET=old');
});
```

- [ ] **Step 4: Run direct tool tests to verify they fail**

Run:

```bash
bun run --filter '@omnicraft/backend' test -- src/agent/tools/file/read-file.test.ts src/agent/tools/file/write-file.test.ts src/agent/tools/file/edit-file.test.ts
```

Expected: FAIL because the direct file tools do not call the policy yet.

- [ ] **Step 5: Enforce policy in `read-file.ts`**

Add this import to `apps/backend/src/agent/tools/file/read-file.ts`:

```ts
import {
  checkExistingPathAccess,
  checkLexicalPathAccess,
} from '@/helpers/sensitive-path-policy.js';
```

Immediately after resolving `absolutePath`, insert:

```ts
const lexicalPolicy = checkLexicalPathAccess(absolutePath);
if (!lexicalPolicy.allowed) {
  return {
    data: {message: lexicalPolicy.message},
    content: lexicalPolicy.message,
    status: 'failure',
  };
}
```

Keep the existing stat block that returns `File not found` for missing files.
After the `!stat.isFile()` branch and before the binary check, insert:

```ts
const realPolicy = await checkExistingPathAccess(absolutePath);
if (!realPolicy.allowed) {
  return {
    data: {message: realPolicy.message},
    content: realPolicy.message,
    status: 'failure',
  };
}
```

- [ ] **Step 6: Enforce policy in `write-file.ts`**

Add this import to `apps/backend/src/agent/tools/file/write-file.ts`:

```ts
import {
  checkExistingPathAccess,
  checkLexicalPathAccess,
  checkNewPathAccess,
} from '@/helpers/sensitive-path-policy.js';
```

Immediately after resolving `absolutePath`, insert:

```ts
const lexicalPolicy = checkLexicalPathAccess(absolutePath);
if (!lexicalPolicy.allowed) {
  return {
    data: {message: lexicalPolicy.message},
    content: lexicalPolicy.message,
    status: 'failure',
  };
}
```

After the existing `fs.stat(absolutePath)` attempt and before file-stat-tracker checks, insert:

```ts
const policyResult = existingStat
  ? await checkExistingPathAccess(absolutePath)
  : await checkNewPathAccess(absolutePath);
if (!policyResult.allowed) {
  return {
    data: {message: policyResult.message},
    content: policyResult.message,
    status: 'failure',
  };
}
```

- [ ] **Step 7: Enforce policy in `edit-file.ts`**

Add this import to `apps/backend/src/agent/tools/file/edit-file.ts`:

```ts
import {
  checkExistingPathAccess,
  checkLexicalPathAccess,
} from '@/helpers/sensitive-path-policy.js';
```

Immediately after resolving `absolutePath`, insert:

```ts
const lexicalPolicy = checkLexicalPathAccess(absolutePath);
if (!lexicalPolicy.allowed) {
  return {
    data: {message: lexicalPolicy.message},
    content: lexicalPolicy.message,
    status: 'failure',
  };
}
```

After the existing stat success and `stat.isFile()` check, insert:

```ts
const realPolicy = await checkExistingPathAccess(absolutePath);
if (!realPolicy.allowed) {
  return {
    data: {message: realPolicy.message},
    content: realPolicy.message,
    status: 'failure',
  };
}
```

- [ ] **Step 8: Run direct tool tests to verify they pass**

Run:

```bash
bun run --filter '@omnicraft/backend' test -- src/agent/tools/file/read-file.test.ts src/agent/tools/file/write-file.test.ts src/agent/tools/file/edit-file.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit direct tool enforcement**

```bash
git add apps/backend/src/agent/tools/file/read-file.ts apps/backend/src/agent/tools/file/write-file.ts apps/backend/src/agent/tools/file/edit-file.ts apps/backend/src/agent/tools/file/read-file.test.ts apps/backend/src/agent/tools/file/write-file.test.ts apps/backend/src/agent/tools/file/edit-file.test.ts
git commit -m "feat: block sensitive direct file operations"
```

---

### Task 3: Enforce Policy in Recursive Search Tools

**Files:**

- Modify: `apps/backend/src/agent/tools/file/find-files.ts`
- Modify: `apps/backend/src/agent/tools/file/search-files.ts`
- Test: `apps/backend/src/agent/tools/file/find-files.test.ts`
- Test: `apps/backend/src/agent/tools/file/search-files.test.ts`

- [ ] **Step 1: Write failing `find_files` tests**

Append inside `describe('success cases', ...)` in `apps/backend/src/agent/tools/file/find-files.test.ts`:

```ts
it('skips blocked paths and appends the policy note', async () => {
  await writeFile('src/app.ts', '');
  await writeFile('.env', 'SECRET=value');
  await writeFile('.git/config', '[core]');

  const result = await findFilesTool.execute({pattern: '**/*'}, context);

  expect(result.status).toBe('success');
  assert(result.status === 'success');
  expect(result.content).toContain('src/app.ts');
  expect(result.content).not.toContain('.env');
  expect(result.content).not.toContain('.git/config');
  expect(result.content).toContain(
    'Some paths were skipped because they are blocked by file access policy',
  );
  expect(result.data.files).toContain('src/app.ts');
  expect(result.data.files).not.toContain('.env');
});

it('skips symlinked files', async () => {
  const target = await writeFile('target.ts', '');
  await fs.symlink(target, path.join(tmpDir, 'link.ts'));

  const result = await findFilesTool.execute({pattern: '**/*.ts'}, context);

  expect(result.status).toBe('success');
  assert(result.status === 'success');
  expect(result.data.files).toContain('target.ts');
  expect(result.data.files).not.toContain('link.ts');
  expect(result.content).toContain(
    'Some paths were skipped because they are blocked by file access policy',
  );
});
```

Append inside `describe('error cases', ...)` in the same file:

```ts
it('denies a search root whose real target is blocked', async () => {
  await fs.mkdir(path.join(tmpDir, '.git'), {recursive: true});
  await fs.symlink(
    path.join(tmpDir, '.git'),
    path.join(tmpDir, 'git-link'),
    'dir',
  );

  const result = await findFilesTool.execute(
    {pattern: '**/*', path: 'git-link'},
    context,
  );

  expect(result.status).toBe('failure');
  assert(result.status === 'failure');
  expect(result.content).toContain('Access denied by file access policy');
});
```

- [ ] **Step 2: Write failing `search_files` tests**

Append inside `describe('success cases', ...)` in `apps/backend/src/agent/tools/file/search-files.test.ts`:

```ts
it('skips blocked paths and appends the policy note', async () => {
  await writeFile('src/app.ts', 'target\n');
  await writeFile('.env', 'target\n');
  await writeFile('.git/config', 'target\n');

  const result = await searchFilesTool.execute({pattern: 'target'}, context);

  expect(result.status).toBe('success');
  assert(result.status === 'success');
  expect(result.content).toContain('src/app.ts:1: target');
  expect(result.content).not.toContain('.env');
  expect(result.content).not.toContain('.git/config');
  expect(result.content).toContain(
    'Some paths were skipped because they are blocked by file access policy',
  );
  expect(result.data.matches.map((m) => m.file)).toEqual(['src/app.ts']);
});

it('skips symlinked files', async () => {
  const target = await writeFile('target.ts', 'target\n');
  await fs.symlink(target, path.join(tmpDir, 'link.ts'));

  const result = await searchFilesTool.execute({pattern: 'target'}, context);

  expect(result.status).toBe('success');
  assert(result.status === 'success');
  expect(result.data.matches.map((m) => m.file)).toEqual(['target.ts']);
  expect(result.content).toContain(
    'Some paths were skipped because they are blocked by file access policy',
  );
});
```

Append inside `describe('error cases', ...)` in the same file:

```ts
it('denies a search root whose real target is blocked', async () => {
  await fs.mkdir(path.join(tmpDir, '.git'), {recursive: true});
  await fs.symlink(
    path.join(tmpDir, '.git'),
    path.join(tmpDir, 'git-link'),
    'dir',
  );

  const result = await searchFilesTool.execute(
    {pattern: 'anything', path: 'git-link'},
    context,
  );

  expect(result.status).toBe('failure');
  assert(result.status === 'failure');
  expect(result.content).toContain('Access denied by file access policy');
});
```

- [ ] **Step 3: Run recursive search tests to verify they fail**

Run:

```bash
bun run --filter '@omnicraft/backend' test -- src/agent/tools/file/find-files.test.ts src/agent/tools/file/search-files.test.ts
```

Expected: FAIL because the tools still include blocked and symlinked entries.

- [ ] **Step 4: Update `find-files.ts`**

Add this import:

```ts
import {
  checkExistingPathAccess,
  checkLexicalPathAccess,
  FILE_ACCESS_POLICY_SKIPPED_MESSAGE,
  isSymbolicLinkPath,
} from '@/helpers/sensitive-path-policy.js';
```

After verifying `searchDir` exists and is a directory, insert:

```ts
const rootPolicy = await checkExistingPathAccess(searchDir);
if (!rootPolicy.allowed) {
  return {
    data: {message: rootPolicy.message},
    content: rootPolicy.message,
    status: 'failure',
  };
}
```

Add `followSymbolicLinks: false` to the fast-glob options:

```ts
const stream = fg.stream(args.pattern, {
  cwd: searchDir,
  onlyFiles: true,
  dot: true,
  followSymbolicLinks: false,
});
```

Add a skipped flag next to `timedOut`:

```ts
let skippedByPolicy = false;
```

Inside the `for await` loop, replace the direct `entries.push(entry);` with:

```ts
const absoluteEntryPath = path.join(searchDir, entry);
const entryPolicy = checkLexicalPathAccess(absoluteEntryPath);
if (!entryPolicy.allowed || (await isSymbolicLinkPath(absoluteEntryPath))) {
  skippedByPolicy = true;
  continue;
}

entries.push(entry);
```

When building successful content bodies, append the note with:

```ts
const policyNote = skippedByPolicy
  ? `\n${FILE_ACCESS_POLICY_SKIPPED_MESSAGE}`
  : '';
```

Then append `${policyNote}` to the `content` string in the no-match, hit-limit,
and normal-success returns. Example normal return:

```ts
return {
  data,
  content: `${header}\n${body}${policyNote}`,
  status: 'success',
};
```

Update the tool description string to include:

```ts
'Symlinked directories and files are not traversed or returned. ' +
  'If expected files are missing from results, review whether they are behind a symlink; ' +
  'do not attempt to bypass file access policy.';
```

- [ ] **Step 5: Update `search-files.ts`**

Add this import:

```ts
import {
  checkExistingPathAccess,
  checkLexicalPathAccess,
  FILE_ACCESS_POLICY_SKIPPED_MESSAGE,
  isSymbolicLinkPath,
} from '@/helpers/sensitive-path-policy.js';
```

After verifying `searchDir` exists and is a directory, insert:

```ts
const rootPolicy = await checkExistingPathAccess(searchDir);
if (!rootPolicy.allowed) {
  return {
    data: {message: rootPolicy.message},
    content: rootPolicy.message,
    status: 'failure',
  };
}
```

Add `followSymbolicLinks: false` to the fast-glob options:

```ts
const stream = fg.stream(args.filePattern ?? '**/*', {
  cwd: searchDir,
  onlyFiles: true,
  dot: true,
  followSymbolicLinks: false,
});
```

Add a skipped flag near `timedOut`:

```ts
let skippedByPolicy = false;
```

Inside the `for await` loop, after computing `absolutePath`, insert before creating `task`:

```ts
const entryPolicy = checkLexicalPathAccess(absolutePath);
if (!entryPolicy.allowed || (await isSymbolicLinkPath(absolutePath))) {
  skippedByPolicy = true;
  continue;
}
```

Before output branches, create:

```ts
const policyNote = skippedByPolicy
  ? `\n${FILE_ACCESS_POLICY_SKIPPED_MESSAGE}`
  : '';
```

Append `${policyNote}` to successful no-match, hit-limit, and normal-success content. Example normal return:

```ts
return {data, content: `${header}\n${body}${policyNote}`, status: 'success'};
```

Update the tool description string to include:

```ts
'Symlinked directories and files are not traversed or searched. ' +
  'If expected matches are missing, review whether the files are behind a symlink; ' +
  'do not attempt to bypass file access policy.';
```

- [ ] **Step 6: Run recursive search tests to verify they pass**

Run:

```bash
bun run --filter '@omnicraft/backend' test -- src/agent/tools/file/find-files.test.ts src/agent/tools/file/search-files.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit recursive search enforcement**

```bash
git add apps/backend/src/agent/tools/file/find-files.ts apps/backend/src/agent/tools/file/search-files.ts apps/backend/src/agent/tools/file/find-files.test.ts apps/backend/src/agent/tools/file/search-files.test.ts
git commit -m "feat: skip sensitive paths in file searches"
```

---

### Task 4: Reject Blocked Workspace Roots

**Files:**

- Modify: `apps/backend/src/services/file-access-settings/types.ts`
- Modify: `apps/backend/src/services/file-access-settings/helpers.ts`
- Test: `apps/backend/src/services/file-access-settings/helpers.test.ts`

- [ ] **Step 1: Write failing workspace validation tests**

Append to `apps/backend/src/services/file-access-settings/helpers.test.ts`:

```ts
it('rejects blocked workspace roots', async () => {
  const gitDir = path.join(tempDir, '.git');
  await fs.mkdir(gitDir);

  const {errors} = await normalizeAndValidatePaths([{path: gitDir}]);

  expect(errors).toEqual([{path: gitDir, reason: PathValidationError.BLOCKED}]);
});

it('allows normal workspaces that contain blocked descendants', async () => {
  await fs.mkdir(path.join(tempDir, '.git'));
  await fs.writeFile(path.join(tempDir, '.env'), 'SECRET=value');

  const {normalized, errors} = await normalizeAndValidatePaths([
    {path: tempDir},
  ]);

  expect(errors).toEqual([]);
  expect(normalized).toEqual([{path: tempDir}]);
});
```

- [ ] **Step 2: Run workspace validation tests to verify they fail**

Run:

```bash
bun run --filter '@omnicraft/backend' test -- src/services/file-access-settings/helpers.test.ts
```

Expected: FAIL because `PathValidationError.BLOCKED` does not exist and validation does not call the policy.

- [ ] **Step 3: Add `BLOCKED` error enum**

Modify `apps/backend/src/services/file-access-settings/types.ts`:

```ts
export enum PathValidationError {
  NOT_ABSOLUTE = 'NOT_ABSOLUTE',
  DUPLICATE = 'DUPLICATE',
  NOT_FOUND = 'NOT_FOUND',
  NOT_DIRECTORY = 'NOT_DIRECTORY',
  NOT_ACCESSIBLE = 'NOT_ACCESSIBLE',
  BLOCKED = 'BLOCKED',
}
```

- [ ] **Step 4: Call the policy from workspace validation**

Modify `apps/backend/src/services/file-access-settings/helpers.ts`.

Add import:

```ts
import {checkLexicalPathAccess} from '@/helpers/sensitive-path-policy.js';
```

Inside `normalizeAndValidatePaths`, after the duplicate check and before `validateSinglePath(resolvedPath)`, insert:

```ts
const policy = checkLexicalPathAccess(resolvedPath);
if (!policy.allowed) {
  errors.push({path: entry.path, reason: PathValidationError.BLOCKED});
  continue;
}
```

- [ ] **Step 5: Run workspace validation tests to verify they pass**

Run:

```bash
bun run --filter '@omnicraft/backend' test -- src/services/file-access-settings/helpers.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit workspace validation**

```bash
git add apps/backend/src/services/file-access-settings/types.ts apps/backend/src/services/file-access-settings/helpers.ts apps/backend/src/services/file-access-settings/helpers.test.ts
git commit -m "feat: reject blocked file access workspaces"
```

---

### Task 5: Final Verification and Cleanup

**Files:**

- Review only unless verification finds issues.

- [ ] **Step 1: Run full backend tests**

Run:

```bash
bun run --filter '@omnicraft/backend' test
```

Expected: PASS.

- [ ] **Step 2: Run backend typecheck**

Run:

```bash
bun run --filter '@omnicraft/backend' typecheck
```

Expected: PASS.

- [ ] **Step 3: Run backend lint**

Run:

```bash
bun run --filter '@omnicraft/backend' lint
```

Expected: PASS.

- [ ] **Step 4: Run format check**

Run:

```bash
bun run format:check
```

Expected: PASS.

- [ ] **Step 5: Inspect final diff for policy consistency**

Run:

```bash
git diff --stat HEAD~4..HEAD
git diff HEAD~4..HEAD -- apps/backend/src/helpers/sensitive-path-policy.ts apps/backend/src/agent/tools/file apps/backend/src/services/file-access-settings
```

Expected: All five file tools use `sensitive-path-policy`, search tools set `followSymbolicLinks: false`, and workspace validation uses `PathValidationError.BLOCKED`.

- [ ] **Step 6: Commit verification fixes if needed**

If Step 1-5 required fixes, commit them:

```bash
git add apps/backend/src
git commit -m "fix: align sensitive path policy enforcement"
```

If no fixes were needed, do not create an empty commit.

---

## Implementation Notes

- Do not add an LLM-facing option to follow symbolic links.
- Do not block all dotfiles. `.gitignore`, `.prettierrc`, and similar project files must remain accessible unless they match a specific blocked rule.
- Direct file operations should include the requested path in the denial message.
- Recursive searches should avoid listing each skipped blocked path.
- `run_command` remains out of scope for this implementation.
