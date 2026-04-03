# Web Fetch Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `web_fetch` and `web_fetch_raw` tools to the `WebToolSet`, allowing the LLM agent to fetch URL content as Markdown or raw text.

**Architecture:** Two tools share HTTP infrastructure (URL validation, fetch with timeout/size limits, content-type checking) and a temporary file fallback for large responses. `web_fetch` converts HTML via Readability + Turndown; `web_fetch_raw` returns content as-is. The `ToolExecutionContext` is extended with `extraAllowedPaths` so `read_file` can access temporary files.

**Tech Stack:** Node.js `fetch`, `@mozilla/readability`, `linkedom`, `turndown`, Zod, Vitest

**Spec:** `docs/superpowers/specs/2026-04-03-web-fetch-tool-design.md`

---

## File Structure

All paths below are relative to `apps/backend/src/`.

### New Files

| File                                        | Responsibility                                                                        |
| ------------------------------------------- | ------------------------------------------------------------------------------------- |
| `agent/tool-sets/web/helpers.ts`            | Shared utilities for web tools (`isTextContentType`, `fetchBody`, `writeToTempFile`). |
| `agent/tool-sets/web/helpers.test.ts`       | Tests for web helpers.                                                                |
| `agent/tool-sets/web/url-validator.ts`      | URL protocol validation (http/https only). Owns error messages.                       |
| `agent/tool-sets/web/url-validator.test.ts` | Tests for URL validator.                                                              |
| `agent/tool-sets/web/web-fetch.ts`          | `web_fetch` tool: fetch URL, convert HTML to Markdown, handle large content fallback. |
| `agent/tool-sets/web/web-fetch.test.ts`     | Tests for `web_fetch` tool.                                                           |
| `agent/tool-sets/web/web-fetch-raw.ts`      | `web_fetch_raw` tool: fetch URL, return raw text, handle large content fallback.      |
| `agent/tool-sets/web/web-fetch-raw.test.ts` | Tests for `web_fetch_raw` tool.                                                       |

### Modified Files

| File                                  | Change                                                                          |
| ------------------------------------- | ------------------------------------------------------------------------------- |
| `agent-core/tool/types.ts`            | Add `AllowedPath` interface, add `extraAllowedPaths` to `ToolExecutionContext`. |
| `agent-core/tool/index.ts`            | Export `AllowedPath` type.                                                      |
| `agent-core/tool/testing.ts`          | Add `extraAllowedPaths: []` default to `createMockContext`.                     |
| `agent-core/agent/types.ts`           | Add `extraAllowedPaths` to `AgentOptions`.                                      |
| `agent-core/agent/agent.ts`           | Store `extraAllowedPaths`, pass it in `ToolExecutionContext`.                   |
| `agent/tools/file/read-file.ts`       | Extend path validation to check `extraAllowedPaths`.                            |
| `agent/tools/file/read-file.test.ts`  | Add tests for `extraAllowedPaths` access.                                       |
| `agent/tool-sets/web/web-tool-set.ts` | Register `webFetchTool` and `webFetchRawTool`.                                  |
| `agent/tool-sets/web/index.ts`        | Update barrel exports.                                                          |

---

### Task 1: Install Dependencies

**Files:**

- Modify: `apps/backend/package.json`

- [ ] **Step 1: Install the three npm packages**

```bash
cd apps/backend && bun add @mozilla/readability linkedom turndown
```

- [ ] **Step 2: Install type declarations for turndown**

```bash
cd apps/backend && bun add -d @types/turndown
```

Note: `@mozilla/readability` ships its own types. `linkedom` ships its own types. `turndown` needs `@types/turndown`.

- [ ] **Step 3: Verify installation**

```bash
cd apps/backend && bun run typecheck
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/package.json bun.lock
git commit -m "chore(backend): add readability, linkedom, and turndown dependencies"
```

---

### Task 2: Add `AllowedPath` to `ToolExecutionContext`

**Files:**

- Modify: `apps/backend/src/agent-core/tool/types.ts`
- Modify: `apps/backend/src/agent-core/tool/index.ts`
- Modify: `apps/backend/src/agent-core/tool/testing.ts`
- Modify: `apps/backend/src/agent-core/agent/types.ts`
- Modify: `apps/backend/src/agent-core/agent/agent.ts`

- [ ] **Step 1: Add `AllowedPath` interface and `extraAllowedPaths` field to `types.ts`**

In `apps/backend/src/agent-core/tool/types.ts`, add before the `ToolExecutionContext` interface:

```ts
/** A directory the agent is allowed to access beyond its working directory. */
export interface AllowedPath {
  /** Absolute path of the allowed directory. */
  readonly path: string;
  /** 'read' = read-only, 'read-write' = read and write. */
  readonly mode: 'read' | 'read-write';
}
```

Add to `ToolExecutionContext`:

```ts
  /**
   * Additional paths the agent is allowed to access beyond workingDirectory.
   * workingDirectory is always read-write and should NOT be listed here.
   */
  readonly extraAllowedPaths: readonly AllowedPath[];
```

- [ ] **Step 2: Export `AllowedPath` from `index.ts`**

In `apps/backend/src/agent-core/tool/index.ts`, update the type export:

```ts
export type {
  AllowedPath,
  ToolDefinition,
  ToolExecutionContext,
} from './types.js';
```

- [ ] **Step 3: Update `createMockContext` in `testing.ts`**

In `apps/backend/src/agent-core/tool/testing.ts`, add to the default object in `createMockContext`:

```ts
    extraAllowedPaths: [],
```

This goes after the `fileCache` line and before the `...overrides` spread.

- [ ] **Step 4: Add `extraAllowedPaths` to `AgentOptions`**

In `apps/backend/src/agent-core/agent/types.ts`, add to the `AgentOptions` interface:

```ts
  readonly extraAllowedPaths: readonly AllowedPath[];
```

Add the import at the top:

```ts
import type {AllowedPath} from '../tool/index.js';
```

- [ ] **Step 5: Pass `extraAllowedPaths` through `Agent`**

In `apps/backend/src/agent-core/agent/agent.ts`:

1. Add an import for `os`:

```ts
import os from 'node:os';
```

2. Add a private field:

```ts
  private readonly extraAllowedPaths: readonly AllowedPath[];
```

3. In the constructor, after `this.getMaxToolRounds = options.getMaxToolRounds;`, add:

```ts
this.extraAllowedPaths = [
  {path: os.tmpdir(), mode: 'read-write' as const},
  ...options.extraAllowedPaths,
];
```

The base class always includes `os.tmpdir()` as read-write. Subclasses can append additional paths via `options.extraAllowedPaths`.

4. In the `executeTool` method, add `extraAllowedPaths` to the context object:

```ts
const context: ToolExecutionContext = {
  availableSkills: this.getAvailableSkills(),
  availableToolSets: this.getAvailableToolSets(),
  loadedToolSets: this.loadedToolSets,
  loadToolSetToAgent: (toolSet) => {
    this.loadedToolSets.add(toolSet);
  },
  workingDirectory: this.workingDirectory,
  fileCache: this.fileCache,
  extraAllowedPaths: this.extraAllowedPaths,
};
```

5. Add the import for `AllowedPath` — add it to the existing import:

```ts
import type {
  AllowedPath,
  ToolDefinition,
  ToolExecutionContext,
} from '../tool/index.js';
```

- [ ] **Step 6: Verify typecheck and tests pass**

```bash
cd apps/backend && bun run typecheck && bun run test
```

Expected: All pass.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/agent-core/
git commit -m "feat(backend): add AllowedPath and extraAllowedPaths to ToolExecutionContext"
```

---

### Task 3: Extend `read_file` Path Validation for `extraAllowedPaths`

**Files:**

- Modify: `apps/backend/src/agent/tools/file/read-file.ts`
- Modify: `apps/backend/src/agent/tools/file/read-file.test.ts`

- [ ] **Step 1: Write the failing tests**

In `apps/backend/src/agent/tools/file/read-file.test.ts`, add a new `describe` block inside the outer `describe('readFileTool', ...)`:

```ts
describe('extraAllowedPaths', () => {
  let extraDir: string;

  beforeEach(async () => {
    extraDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rft-extra-'));
  });

  afterEach(async () => {
    await fs.rm(extraDir, {recursive: true, force: true});
  });

  it('allows reading a file in an extra read-only path', async () => {
    const filePath = path.join(extraDir, 'allowed.txt');
    await fs.writeFile(filePath, 'extra content');

    const extraContext = createMockContext({
      workingDirectory: tmpDir,
      fileCache: new FileContentCache(),
      extraAllowedPaths: [{path: extraDir, mode: 'read'}],
    });

    const result = await readFileTool.execute({filePath}, extraContext);

    expect(result).toContain('extra content');
  });

  it('allows reading a file in an extra read-write path', async () => {
    const filePath = path.join(extraDir, 'rw.txt');
    await fs.writeFile(filePath, 'rw content');

    const extraContext = createMockContext({
      workingDirectory: tmpDir,
      fileCache: new FileContentCache(),
      extraAllowedPaths: [{path: extraDir, mode: 'read-write'}],
    });

    const result = await readFileTool.execute({filePath}, extraContext);

    expect(result).toContain('rw content');
  });

  it('rejects reading a file outside all allowed paths', async () => {
    const otherDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rft-other-'));
    const filePath = path.join(otherDir, 'secret.txt');
    await fs.writeFile(filePath, 'secret');

    const extraContext = createMockContext({
      workingDirectory: tmpDir,
      fileCache: new FileContentCache(),
      extraAllowedPaths: [{path: extraDir, mode: 'read'}],
    });

    const result = await readFileTool.execute({filePath}, extraContext);

    expect(result).toContain('Error: Access denied');

    await fs.rm(otherDir, {recursive: true, force: true});
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/backend && bun run test -- src/agent/tools/file/read-file.test.ts
```

Expected: The first two new tests fail (access denied), the third passes.

- [ ] **Step 3: Update `read_file` path validation**

In `apps/backend/src/agent/tools/file/read-file.ts`, replace the security check section:

```ts
// 2. Security check
if (!isSubPath(workingDirectory, absolutePath)) {
  return 'Error: Access denied: path is outside the working directory';
}
```

with:

```ts
// 2. Security check: workingDirectory or extraAllowedPaths
if (!isSubPath(workingDirectory, absolutePath)) {
  const allowed = context.extraAllowedPaths.some((entry) =>
    isSubPath(entry.path, absolutePath),
  );
  if (!allowed) {
    return 'Error: Access denied: path is outside the allowed directories';
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/backend && bun run test -- src/agent/tools/file/read-file.test.ts
```

Expected: All pass.

- [ ] **Step 5: Run full test suite**

```bash
cd apps/backend && bun run typecheck && bun run test
```

Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/agent/tools/file/
git commit -m "feat(backend): extend read_file to support extraAllowedPaths"
```

---

### Task 4: Create URL Validator

**Files:**

- Create: `apps/backend/src/agent/tool-sets/web/url-validator.ts`
- Create: `apps/backend/src/agent/tool-sets/web/url-validator.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/backend/src/agent/tool-sets/web/url-validator.test.ts`:

```ts
import {describe, expect, it} from 'vitest';

import {validateUrl} from './url-validator.js';

describe('validateUrl', () => {
  it('accepts http URLs', () => {
    expect(validateUrl('http://example.com')).toBeUndefined();
  });

  it('accepts https URLs', () => {
    expect(validateUrl('https://example.com/path?q=1')).toBeUndefined();
  });

  it('rejects ftp URLs', () => {
    const error = validateUrl('ftp://files.example.com/data');
    expect(error).toContain('ftp:');
  });

  it('rejects file URLs', () => {
    const error = validateUrl('file:///etc/passwd');
    expect(error).toContain('file:');
  });

  it('rejects data URIs', () => {
    const error = validateUrl('data:text/html,<h1>hi</h1>');
    expect(error).toContain('data:');
  });

  it('rejects invalid URLs', () => {
    const error = validateUrl('not-a-url');
    expect(error).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/backend && bun run test -- src/agent/tool-sets/web/url-validator.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the URL validator**

Create `apps/backend/src/agent/tool-sets/web/url-validator.ts`:

```ts
/**
 * Validates a URL for use by web tools.
 * Returns an error message string if invalid, or undefined if valid.
 */
export function validateUrl(url: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return `Error: Invalid URL: ${url}`;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return `Error: Unsupported URL protocol: ${parsed.protocol} — only http: and https: are allowed`;
  }

  return undefined;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/backend && bun run test -- src/agent/tool-sets/web/url-validator.test.ts
```

Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/agent/tool-sets/web/url-validator.ts apps/backend/src/agent/tool-sets/web/url-validator.test.ts
git commit -m "feat(backend): add URL validator for web tools"
```

---

### Task 5: Create Web Helpers

**Files:**

- Create: `apps/backend/src/agent/tool-sets/web/helpers.ts`
- Create: `apps/backend/src/agent/tool-sets/web/helpers.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/backend/src/agent/tool-sets/web/helpers.test.ts`:

```ts
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

import {fetchBody, isTextContentType, writeToTempFile} from './helpers.js';

/** Creates a local HTTP server that responds with given content-type and body. */
function createTestServer(
  contentType: string,
  body: string | Buffer,
  statusCode = 200,
): http.Server {
  return http.createServer((_req, res) => {
    res.writeHead(statusCode, {'Content-Type': contentType});
    res.end(body);
  });
}

/** Returns the base URL for a listening server. */
function serverUrl(server: http.Server): string {
  const addr = server.address();
  if (typeof addr === 'string' || addr === null)
    throw new Error('Unexpected address');
  return `http://127.0.0.1:${addr.port.toString()}`;
}

describe('isTextContentType', () => {
  it('returns true for text/html', () => {
    expect(isTextContentType('text/html')).toBe(true);
  });

  it('returns true for text/html with charset', () => {
    expect(isTextContentType('text/html; charset=utf-8')).toBe(true);
  });

  it('returns true for text/plain', () => {
    expect(isTextContentType('text/plain')).toBe(true);
  });

  it('returns true for application/json', () => {
    expect(isTextContentType('application/json')).toBe(true);
  });

  it('returns true for application/xml', () => {
    expect(isTextContentType('application/xml')).toBe(true);
  });

  it('returns true for application/rss+xml', () => {
    expect(isTextContentType('application/rss+xml')).toBe(true);
  });

  it('returns true for application/vnd.api+json', () => {
    expect(isTextContentType('application/vnd.api+json')).toBe(true);
  });

  it('returns false for image/png', () => {
    expect(isTextContentType('image/png')).toBe(false);
  });

  it('returns false for application/octet-stream', () => {
    expect(isTextContentType('application/octet-stream')).toBe(false);
  });

  it('returns false for application/pdf', () => {
    expect(isTextContentType('application/pdf')).toBe(false);
  });
});

describe('fetchBody', () => {
  const opts = {
    timeoutMs: 5000,
    maxResponseSize: 1_048_576,
    headers: new Headers({'User-Agent': 'Test/1.0'}),
  };

  describe('success', () => {
    let server: http.Server;

    beforeAll(
      () =>
        new Promise<void>((resolve) => {
          server = createTestServer(
            'text/html; charset=utf-8',
            '<h1>Hello</h1>',
          );
          server.listen(0, '127.0.0.1', resolve);
        }),
    );

    afterAll(
      () =>
        new Promise<void>((resolve, reject) => {
          server.close((err) => (err ? reject(err) : resolve()));
        }),
    );

    it('returns body and content type', async () => {
      const result = await fetchBody(serverUrl(server), opts);
      expect(result.body).toContain('<h1>Hello</h1>');
      expect(result.contentType).toContain('text/html');
    });
  });

  describe('errors', () => {
    it('throws for non-text content types', async () => {
      const server = createTestServer(
        'image/png',
        Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      );
      await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', resolve);
      });

      try {
        await expect(fetchBody(serverUrl(server), opts)).rejects.toThrow(
          'Unsupported content type',
        );
      } finally {
        await new Promise<void>((resolve, reject) => {
          server.close((err) => (err ? reject(err) : resolve()));
        });
      }
    });

    it('throws for HTTP error status', async () => {
      const server = createTestServer('text/plain', 'Not Found', 404);
      await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', resolve);
      });

      try {
        await expect(fetchBody(serverUrl(server), opts)).rejects.toThrow('404');
      } finally {
        await new Promise<void>((resolve, reject) => {
          server.close((err) => (err ? reject(err) : resolve()));
        });
      }
    });

    it('throws when connection fails', async () => {
      await expect(fetchBody('http://127.0.0.1:1', opts)).rejects.toThrow();
    });
  });
});

describe('writeToTempFile', () => {
  let filePath: string;

  afterEach(async () => {
    if (filePath) {
      await fs.rm(filePath, {force: true});
    }
  });

  it('writes content and returns a path under the given directory', async () => {
    const dir = path.join(os.tmpdir(), 'wf-helper-test');
    filePath = await writeToTempFile('hello world', {directory: dir});
    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toBe('hello world');
    expect(filePath.startsWith(dir)).toBe(true);
  });

  it('returns a .md file', async () => {
    const dir = path.join(os.tmpdir(), 'wf-helper-test');
    filePath = await writeToTempFile('test', {directory: dir});
    expect(path.extname(filePath)).toBe('.md');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/backend && bun run test -- src/agent/tool-sets/web/helpers.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helpers**

Create `apps/backend/src/agent/tool-sets/web/helpers.ts`:

```ts
import fs from 'node:fs/promises';
import path from 'node:path';

/** Options for fetchBody. */
export interface FetchBodyOptions {
  readonly timeoutMs: number;
  readonly maxResponseSize: number;
  readonly headers: Headers;
}

/** Successful fetch result. */
export interface FetchBodyResult {
  readonly body: string;
  readonly contentType: string;
}

/** Options for writeToTempFile. */
export interface WriteToTempFileOptions {
  readonly directory: string;
}

/** Returns true if the Content-Type indicates a text-based format. */
export function isTextContentType(contentType: string): boolean {
  const ct = contentType.toLowerCase();
  return (
    ct.startsWith('text/') ||
    ct.includes('application/json') ||
    ct.includes('application/xml') ||
    ct.includes('+xml') ||
    ct.includes('+json')
  );
}

/**
 * Fetches a URL and returns the response body as text.
 * Throws on network errors, non-2xx status, non-text content types,
 * or responses exceeding the size limit.
 */
export async function fetchBody(
  url: string,
  options: FetchBodyOptions,
): Promise<FetchBodyResult> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(options.timeoutMs),
    headers: options.headers,
  });

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status.toString()} ${response.statusText}`,
    );
  }

  const contentType = response.headers.get('content-type');
  if (!contentType) {
    throw new Error('Response has no Content-Type header');
  }
  if (!isTextContentType(contentType)) {
    throw new Error(`Unsupported content type: ${contentType}`);
  }

  const contentLength = response.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > options.maxResponseSize) {
    throw new Error(
      `Response too large (exceeds ${(options.maxResponseSize / 1024 / 1024).toString()}MB limit)`,
    );
  }

  // Stream body and enforce size limit
  if (!response.body) {
    throw new Error('Response body is not readable');
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  for await (const chunk of response.body) {
    totalBytes += chunk.byteLength;
    if (totalBytes > options.maxResponseSize) {
      throw new Error(
        `Response too large (exceeds ${(options.maxResponseSize / 1024 / 1024).toString()}MB limit)`,
      );
    }
    chunks.push(chunk);
  }

  const body = new TextDecoder().decode(Buffer.concat(chunks));

  return {body, contentType};
}

/** Writes content to a temporary file and returns the absolute file path. */
export async function writeToTempFile(
  content: string,
  options: WriteToTempFileOptions,
): Promise<string> {
  await fs.mkdir(options.directory, {recursive: true});
  const filePath = path.join(options.directory, `${crypto.randomUUID()}.md`);
  await fs.writeFile(filePath, content, 'utf-8');
  return filePath;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/backend && bun run test -- src/agent/tool-sets/web/helpers.test.ts
```

Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/agent/tool-sets/web/helpers.ts apps/backend/src/agent/tool-sets/web/helpers.test.ts
git commit -m "feat(backend): add isTextContentType helper for web tools"
```

---

### Task 6: Create `web_fetch` Tool

**Files:**

- Create: `apps/backend/src/agent/tool-sets/web/web-fetch.ts`
- Create: `apps/backend/src/agent/tool-sets/web/web-fetch.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/backend/src/agent/tool-sets/web/web-fetch.test.ts`:

```ts
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

import {createMockContext} from '@/agent-core/tool/testing.js';
import type {ToolExecutionContext} from '@/agent-core/tool/types.js';

import {webFetchTool} from './web-fetch.js';

/** Creates a local HTTP server that responds with given content-type and body. */
function createTestServer(contentType: string, body: string): http.Server {
  return http.createServer((_req, res) => {
    res.writeHead(200, {'Content-Type': contentType});
    res.end(body);
  });
}

/** Returns the base URL for a listening server. */
function serverUrl(server: http.Server): string {
  const addr = server.address();
  if (typeof addr === 'string' || addr === null)
    throw new Error('Unexpected address');
  return `http://127.0.0.1:${addr.port.toString()}`;
}

describe('webFetchTool', () => {
  let tmpDir: string;
  let context: ToolExecutionContext;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wf-test-'));
    context = createMockContext({workingDirectory: tmpDir});
  });

  afterEach(async () => {
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  it('has the correct name', () => {
    expect(webFetchTool.name).toBe('web_fetch');
  });

  describe('HTML content', () => {
    let server: http.Server;

    const html = `<!DOCTYPE html>
<html><head><title>Test Page</title></head>
<body><article><h1>Hello World</h1><p>This is a test article.</p></article></body>
</html>`;

    beforeAll(
      () =>
        new Promise<void>((resolve) => {
          server = createTestServer('text/html; charset=utf-8', html);
          server.listen(0, '127.0.0.1', resolve);
        }),
    );

    afterAll(
      () =>
        new Promise<void>((resolve, reject) => {
          server.close((err) => (err ? reject(err) : resolve()));
        }),
    );

    it('converts HTML to Markdown with title', async () => {
      const result = await webFetchTool.execute(
        {url: serverUrl(server)},
        context,
      );

      expect(result).toContain('URL:');
      expect(result).toContain('Title:');
      expect(result).toContain('Hello World');
    });

    it('returns full page when includeFullPage is true', async () => {
      const result = await webFetchTool.execute(
        {url: serverUrl(server), includeFullPage: true},
        context,
      );

      expect(result).toContain('URL:');
      expect(result).toContain('Hello World');
    });
  });

  describe('non-HTML content', () => {
    let server: http.Server;
    const json = '{"key": "value"}';

    beforeAll(
      () =>
        new Promise<void>((resolve) => {
          server = createTestServer('application/json', json);
          server.listen(0, '127.0.0.1', resolve);
        }),
    );

    afterAll(
      () =>
        new Promise<void>((resolve, reject) => {
          server.close((err) => (err ? reject(err) : resolve()));
        }),
    );

    it('returns JSON content as-is without Title line', async () => {
      const result = await webFetchTool.execute(
        {url: serverUrl(server)},
        context,
      );

      expect(result).toContain('URL:');
      expect(result).not.toContain('Title:');
      expect(result).toContain('{"key": "value"}');
    });
  });

  describe('error cases', () => {
    it('rejects non-http protocols', async () => {
      const result = await webFetchTool.execute(
        {url: 'ftp://example.com/file'},
        context,
      );

      expect(result).toContain('Error:');
      expect(result).toContain('ftp:');
    });

    it('returns error for non-text content types', async () => {
      const server = http.createServer((_req, res) => {
        res.writeHead(200, {'Content-Type': 'image/png'});
        res.end(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      });

      await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', resolve);
      });

      try {
        const result = await webFetchTool.execute(
          {url: serverUrl(server)},
          context,
        );

        expect(result).toContain('Error: Unsupported content type');
      } finally {
        await new Promise<void>((resolve, reject) => {
          server.close((err) => (err ? reject(err) : resolve()));
        });
      }
    });

    it('returns error when fetch fails', async () => {
      const result = await webFetchTool.execute(
        {url: 'http://127.0.0.1:1'},
        context,
      );

      expect(result).toContain('Error: Failed to fetch URL');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/backend && bun run test -- src/agent/tool-sets/web/web-fetch.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `web_fetch` tool**

Create `apps/backend/src/agent/tool-sets/web/web-fetch.ts`:

```ts
import os from 'node:os';
import path from 'node:path';

import {Readability} from '@mozilla/readability';
import {parseHTML} from 'linkedom';
import TurndownService from 'turndown';
import {z} from 'zod';

import type {
  ToolDefinition,
  ToolExecutionContext,
} from '@/agent-core/tool/index.js';

import {fetchBody, writeToTempFile} from './helpers.js';
import {validateUrl} from './url-validator.js';

const TIMEOUT_MS = 30_000;
const MAX_RESPONSE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_INLINE_SIZE = 32_768; // 32KB
const TEMP_DIR = path.join(os.tmpdir(), 'omnicraft-web-fetch');
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';

const parameters = z.object({
  url: z.string().url().describe('The URL to fetch.'),
  includeFullPage: z
    .boolean()
    .optional()
    .describe(
      'Defaults to false. When false, only the main article content is extracted. ' +
        'Set to true to include the full page content if extraction is incomplete or missing information.',
    ),
});

type WebFetchArgs = z.infer<typeof parameters>;

/** Converts HTML to Markdown, optionally extracting only the article content. */
function htmlToMarkdown(
  html: string,
  includeFullPage: boolean,
): {title: string | undefined; content: string; fellBack: boolean} {
  const {document} = parseHTML(html);
  let title: string | undefined;
  let articleDocument: Document = document;
  let fellBack = false;

  if (!includeFullPage) {
    const reader = new Readability(document.cloneNode(true) as Document);
    const article = reader.parse();

    if (article) {
      title = article.title;
      const {document: articleDoc} = parseHTML(article.content);
      articleDocument = articleDoc;
    } else {
      fellBack = true;
    }
  }

  if (title === undefined) {
    title = document.querySelector('title')?.textContent ?? undefined;
  }

  const turndown = new TurndownService({headingStyle: 'atx'});
  const markdown = turndown.turndown(articleDocument.toString());

  return {title, content: markdown, fellBack};
}

/** Formats the response string for the LLM. */
function formatResponse(
  url: string,
  title: string | undefined,
  content: string,
  note: string | undefined,
): string {
  const lines: string[] = [`URL: ${url}`];
  if (title) {
    lines.push(`Title: ${title}`);
  }
  if (note) {
    lines.push(`Note: ${note}`);
  }
  lines.push('', content);
  return lines.join('\n');
}

/** Built-in tool that fetches a URL and returns its content as Markdown. */
export const webFetchTool: ToolDefinition<typeof parameters> = {
  name: 'web_fetch',
  displayName: 'Web Fetch',
  description:
    'Fetches a URL and returns its content in a readable format. ' +
    'HTML pages are converted to Markdown with article extraction. ' +
    'Other text content (JSON, plain text, XML) is returned as-is.',
  parameters,
  async execute(
    args: WebFetchArgs,
    _context: ToolExecutionContext,
  ): Promise<string> {
    const urlError = validateUrl(args.url);
    if (urlError) return urlError;

    let body: string;
    let contentType: string;
    try {
      const result = await fetchBody(args.url, {
        timeoutMs: TIMEOUT_MS,
        maxResponseSize: MAX_RESPONSE_SIZE,
        headers: new Headers({
          'User-Agent': USER_AGENT,
          Accept: 'text/html, application/json, text/plain, */*',
        }),
      });
      body = result.body;
      contentType = result.contentType;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return `Error: Failed to fetch URL: ${message}`;
    }

    const includeFullPage = args.includeFullPage ?? false;

    let title: string | undefined;
    let content: string;
    let note: string | undefined;

    if (contentType.toLowerCase().includes('text/html')) {
      const result = htmlToMarkdown(body, includeFullPage);
      title = result.title;
      content = result.content;
      if (result.fellBack) {
        note = 'Article extraction failed; showing full page content instead.';
      }
    } else {
      content = body;
    }

    if (Buffer.byteLength(content) > MAX_INLINE_SIZE) {
      const filePath = await writeToTempFile(content, {
        directory: TEMP_DIR,
      });
      return formatResponse(
        args.url,
        title,
        `Content saved to file: ${filePath}`,
        note,
      );
    }

    return formatResponse(args.url, title, content, note);
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/backend && bun run test -- src/agent/tool-sets/web/web-fetch.test.ts
```

Expected: All pass.

- [ ] **Step 5: Run typecheck**

```bash
cd apps/backend && bun run typecheck
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/agent/tool-sets/web/web-fetch.ts apps/backend/src/agent/tool-sets/web/web-fetch.test.ts
git commit -m "feat(backend): add web_fetch tool with HTML-to-Markdown conversion"
```

---

### Task 7: Create `web_fetch_raw` Tool

**Files:**

- Create: `apps/backend/src/agent/tool-sets/web/web-fetch-raw.ts`
- Create: `apps/backend/src/agent/tool-sets/web/web-fetch-raw.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/backend/src/agent/tool-sets/web/web-fetch-raw.test.ts`:

```ts
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

import {createMockContext} from '@/agent-core/tool/testing.js';
import type {ToolExecutionContext} from '@/agent-core/tool/types.js';

import {webFetchRawTool} from './web-fetch-raw.js';

/** Creates a local HTTP server that responds with given content-type and body. */
function createTestServer(contentType: string, body: string): http.Server {
  return http.createServer((_req, res) => {
    res.writeHead(200, {'Content-Type': contentType});
    res.end(body);
  });
}

/** Returns the base URL for a listening server. */
function serverUrl(server: http.Server): string {
  const addr = server.address();
  if (typeof addr === 'string' || addr === null)
    throw new Error('Unexpected address');
  return `http://127.0.0.1:${addr.port.toString()}`;
}

describe('webFetchRawTool', () => {
  let tmpDir: string;
  let context: ToolExecutionContext;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wfr-test-'));
    context = createMockContext({workingDirectory: tmpDir});
  });

  afterEach(async () => {
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  it('has the correct name', () => {
    expect(webFetchRawTool.name).toBe('web_fetch_raw');
  });

  describe('raw content', () => {
    let server: http.Server;

    const html =
      '<html><head><title>Raw Test</title></head><body><h1>Hello</h1></body></html>';

    beforeAll(
      () =>
        new Promise<void>((resolve) => {
          server = createTestServer('text/html; charset=utf-8', html);
          server.listen(0, '127.0.0.1', resolve);
        }),
    );

    afterAll(
      () =>
        new Promise<void>((resolve, reject) => {
          server.close((err) => (err ? reject(err) : resolve()));
        }),
    );

    it('returns raw HTML without conversion', async () => {
      const result = await webFetchRawTool.execute(
        {url: serverUrl(server)},
        context,
      );

      expect(result).toContain('URL:');
      expect(result).not.toContain('Title:');
      expect(result).toContain('<html>');
      expect(result).toContain('<h1>Hello</h1>');
    });
  });

  describe('JSON content', () => {
    let server: http.Server;
    const json = '{"key": "value"}';

    beforeAll(
      () =>
        new Promise<void>((resolve) => {
          server = createTestServer('application/json', json);
          server.listen(0, '127.0.0.1', resolve);
        }),
    );

    afterAll(
      () =>
        new Promise<void>((resolve, reject) => {
          server.close((err) => (err ? reject(err) : resolve()));
        }),
    );

    it('returns JSON content as-is', async () => {
      const result = await webFetchRawTool.execute(
        {url: serverUrl(server)},
        context,
      );

      expect(result).toContain('URL:');
      expect(result).toContain('{"key": "value"}');
    });
  });

  describe('error cases', () => {
    it('rejects non-http protocols', async () => {
      const result = await webFetchRawTool.execute(
        {url: 'ftp://example.com/file'},
        context,
      );

      expect(result).toContain('Error:');
      expect(result).toContain('ftp:');
    });

    it('returns error for non-text content types', async () => {
      const server = http.createServer((_req, res) => {
        res.writeHead(200, {'Content-Type': 'image/png'});
        res.end(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      });

      await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', resolve);
      });

      try {
        const result = await webFetchRawTool.execute(
          {url: serverUrl(server)},
          context,
        );

        expect(result).toContain('Error: Unsupported content type');
      } finally {
        await new Promise<void>((resolve, reject) => {
          server.close((err) => (err ? reject(err) : resolve()));
        });
      }
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/backend && bun run test -- src/agent/tool-sets/web/web-fetch-raw.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `web_fetch_raw` tool**

Create `apps/backend/src/agent/tool-sets/web/web-fetch-raw.ts`:

```ts
import os from 'node:os';
import path from 'node:path';

import {z} from 'zod';

import type {
  ToolDefinition,
  ToolExecutionContext,
} from '@/agent-core/tool/index.js';

import {fetchBody, writeToTempFile} from './helpers.js';
import {validateUrl} from './url-validator.js';

const TIMEOUT_MS = 30_000;
const MAX_RESPONSE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_INLINE_SIZE = 32_768; // 32KB
const TEMP_DIR = path.join(os.tmpdir(), 'omnicraft-web-fetch');
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';

const parameters = z.object({
  url: z.string().url().describe('The URL to fetch.'),
});

type WebFetchRawArgs = z.infer<typeof parameters>;

/** Tool that fetches a URL and returns the raw text content. */
export const webFetchRawTool: ToolDefinition<typeof parameters> = {
  name: 'web_fetch_raw',
  displayName: 'Web Fetch Raw',
  description:
    'Fetches a URL and returns the raw text content with no conversion. ' +
    'Prefer web_fetch for most use cases; only use this tool when you ' +
    'need unprocessed content (e.g., inspecting raw HTML structure).',
  parameters,
  async execute(
    args: WebFetchRawArgs,
    _context: ToolExecutionContext,
  ): Promise<string> {
    const urlError = validateUrl(args.url);
    if (urlError) return urlError;

    let body: string;
    try {
      const result = await fetchBody(args.url, {
        timeoutMs: TIMEOUT_MS,
        maxResponseSize: MAX_RESPONSE_SIZE,
        headers: new Headers({
          'User-Agent': USER_AGENT,
          Accept: '*/*',
        }),
      });
      body = result.body;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return `Error: Failed to fetch URL: ${message}`;
    }

    const header = `URL: ${args.url}`;

    if (Buffer.byteLength(body) > MAX_INLINE_SIZE) {
      const filePath = await writeToTempFile(body, {directory: TEMP_DIR});
      return `${header}\nContent saved to file: ${filePath}`;
    }

    return `${header}\n\n${body}`;
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/backend && bun run test -- src/agent/tool-sets/web/web-fetch-raw.test.ts
```

Expected: All pass.

- [ ] **Step 5: Run typecheck**

```bash
cd apps/backend && bun run typecheck
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/agent/tool-sets/web/web-fetch-raw.ts apps/backend/src/agent/tool-sets/web/web-fetch-raw.test.ts
git commit -m "feat(backend): add web_fetch_raw tool for unprocessed URL content"
```

---

### Task 8: Register Tools in `WebToolSet` and Update Exports

**Files:**

- Modify: `apps/backend/src/agent/tool-sets/web/web-tool-set.ts`
- Modify: `apps/backend/src/agent/tool-sets/web/index.ts`

- [ ] **Step 1: Register tools in `WebToolSet`**

Replace `apps/backend/src/agent/tool-sets/web/web-tool-set.ts`:

```ts
import {ToolSetDefinition} from '@/agent-core/tool-set/index.js';

import {webFetchRawTool} from './web-fetch-raw.js';
import {webFetchTool} from './web-fetch.js';

/** Tool set for web-related operations: fetching URLs, searching, etc. */
export class WebToolSet extends ToolSetDefinition {
  constructor() {
    super({
      name: 'web',
      description:
        'Tools for retrieving information from the web, including fetching URL contents and web search.',
    });
    this.register(webFetchTool);
    this.register(webFetchRawTool);
  }
}
```

- [ ] **Step 2: Update barrel exports**

Replace `apps/backend/src/agent/tool-sets/web/index.ts`:

```ts
export {fetchBody, isTextContentType, writeToTempFile} from './helpers.js';
export type {
  FetchBodyOptions,
  FetchBodyResult,
  WriteToTempFileOptions,
} from './helpers.js';
export {validateUrl} from './url-validator.js';
export {webFetchRawTool} from './web-fetch-raw.js';
export {webFetchTool} from './web-fetch.js';
export {WebToolSet} from './web-tool-set.js';
```

- [ ] **Step 3: Run full typecheck and test suite**

```bash
cd apps/backend && bun run typecheck && bun run test
```

Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/agent/tool-sets/web/
git commit -m "feat(backend): register web_fetch and web_fetch_raw in WebToolSet"
```

---

### Task 9: Pass `extraAllowedPaths` in `CoreAgent`

**Files:**

- Modify: `apps/backend/src/agent/agents/core-agent/core-agent.ts`

- [ ] **Step 1: Add `extraAllowedPaths` to `CoreAgent`**

Replace `apps/backend/src/agent/agents/core-agent/core-agent.ts`:

```ts
import {CoreSkillRegistry} from '@/agent/skills/index.js';
import {CoreToolSetRegistry} from '@/agent/tool-sets/index.js';
import {CoreToolRegistry, FileToolRegistry} from '@/agent/tools/index.js';
import {Agent} from '@/agent-core/agent/index.js';
import type {LlmConfig} from '@/agent-core/llm-api/index.js';
import {settingsService} from '@/services/settings/index.js';

/**
 * Default agent with core tools and skills.
 * Used as the standard agent type for chat sessions.
 */
export class CoreAgent extends Agent {
  constructor(getConfig: () => Promise<LlmConfig>, workingDirectory: string) {
    super(getConfig, {
      toolRegistries: [
        CoreToolRegistry.getInstance(),
        FileToolRegistry.getInstance(),
      ],
      toolSetRegistries: [CoreToolSetRegistry.getInstance()],
      skillRegistries: [CoreSkillRegistry.getInstance()],
      baseSystemPrompt: 'You are a helpful assistant.',
      getMaxToolRounds: async () => {
        const settings = await settingsService.getAll();
        return settings.agent.maxToolRounds;
      },
      workingDirectory,
      extraAllowedPaths: [],
    });
  }
}
```

The Agent base class already includes `os.tmpdir()` as read-write, so `CoreAgent` only needs to pass an empty array. If future subclasses need additional allowed paths, they can append them here.

- [ ] **Step 2: Run full typecheck and test suite**

```bash
cd apps/backend && bun run typecheck && bun run test
```

Expected: All pass.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/agent/agents/core-agent/core-agent.ts
git commit -m "feat(backend): pass extraAllowedPaths in CoreAgent"
```

---

### Task 10: Final Verification

- [ ] **Step 1: Run lint**

```bash
cd apps/backend && bun run lint
```

Check `package.json` for the exact lint command first. If it's `eslint`, run that.

- [ ] **Step 2: Run format check**

```bash
cd apps/backend && bun run format:check
```

Check `package.json` for the exact format command first.

- [ ] **Step 3: Run full test suite one final time**

```bash
cd apps/backend && bun run typecheck && bun run test
```

Expected: All pass.

- [ ] **Step 4: Fix any issues found in steps 1-3, then commit fixes if needed**
