# Web Fetch PDF Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing `web_fetch` and `web_fetch_raw` tools so they can fetch `application/pdf` URLs, extracting the PDF's text and reusing the same downstream pipeline (size limit, temp-file fallback, response formatting).

**Architecture:** The fetch layer (`fetchBody`) stops doing content-type filtering and stops decoding bytes as UTF-8 — it returns the raw `Buffer` plus `Content-Type`, and lets each tool decide how to convert. `web_fetch.ts` grows a small conversion step that branches on content type: `text/html` → Markdown via Readability+Turndown (existing path); `application/pdf` → text via a new private `pdfToText` function defined inline alongside `htmlToMarkdown`, using `unpdf`; other text-ish types → decoded UTF-8 string (existing behavior); anything else → failure. `web_fetch_raw.ts` mirrors only the binary-vs-text decision (no PDF extraction — raw means raw). All size-limit / temp-file / formatting code below the conversion step is untouched.

**Tech Stack:** Node.js `fetch`, `unpdf`, existing `@mozilla/readability` + `linkedom` + `turndown`, Zod, Vitest.

---

## File Structure

All paths below are relative to repo root.

### Modified Files

| File                                                     | Change                                                                                                                                                                                                             |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/backend/package.json`                              | Add `unpdf` dependency.                                                                                                                                                                                            |
| `apps/backend/src/agent/tools/web/helpers.ts`            | `fetchBody` returns `{body: Buffer, contentType}`. Remove `isTextContentType` content-type rejection from `fetchBody`. Keep `isTextContentType` exported for callers. Add `isPdfContentType`.                      |
| `apps/backend/src/agent/tools/web/web-fetch.ts`          | Add private `pdfToText` function alongside the existing private `htmlToMarkdown`. Add PDF branch in the conversion step. Update `Accept` header and tool description. Decode text bodies here, not in `fetchBody`. |
| `apps/backend/src/agent/tools/web/web-fetch-raw.ts`      | Decode text bodies here. Reject non-text content types here (raw = no extraction).                                                                                                                                 |
| `apps/backend/src/agent/tools/web/web-fetch.test.ts`     | Add PDF test cases (success, parse-failure, large-extracted-text → temp file).                                                                                                                                     |
| `apps/backend/src/agent/tools/web/web-fetch-raw.test.ts` | Update non-text test — failure now happens in raw tool, not in fetch.                                                                                                                                              |

### Notes

- `MAX_RESPONSE_SIZE` (5 MB) and `MAX_INLINE_SIZE` (32 KB) are reused as-is. PDFs over 5 MB will fail at fetch time; extracted text over 32 KB falls through to the existing temp-file path.
- The `web_fetch_raw` tool intentionally does **not** parse PDFs — its contract is "no conversion." A PDF URL hitting `web_fetch_raw` should fail cleanly with `Unsupported content type`.
- No changes to `tool-schemas` package: `webFetchParametersSchema` / `webFetchResultSchema` already accept any string content.

---

### Task 1: Install `unpdf`

**Files:**

- Modify: `apps/backend/package.json`, `bun.lock`

- [ ] **Step 1: Add the dependency**

```bash
cd apps/backend && bun add unpdf
```

- [ ] **Step 2: Verify typecheck still passes**

```bash
cd apps/backend && bun run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/package.json bun.lock
git commit -m "chore(backend): add unpdf dependency for PDF text extraction"
```

---

### Task 2: Refactor `fetchBody` to return raw bytes

The fetch layer must stop decoding and stop content-type filtering so callers can choose how to handle each type. This is a pure refactor — no behavior change yet for callers because we update them in this same task to keep the build green.

**Files:**

- Modify: `apps/backend/src/agent/tools/web/helpers.ts`
- Modify: `apps/backend/src/agent/tools/web/web-fetch.ts`
- Modify: `apps/backend/src/agent/tools/web/web-fetch-raw.ts`

- [ ] **Step 1: Update `fetchBody` to return `Buffer` and skip content-type filtering**

Replace the body of `apps/backend/src/agent/tools/web/helpers.ts` with:

```ts
/** Options for fetchBody. */
export interface FetchBodyOptions {
  readonly timeoutMs: number;
  readonly maxResponseSize: number;
  readonly headers: Headers;
}

/** Successful fetch result. */
export interface FetchBodyResult {
  readonly body: Buffer;
  readonly contentType: string;
}

/** Returns true if the Content-Type indicates a text-based format. */
export function isTextContentType(contentType: string): boolean {
  const ct = contentType.toLowerCase();
  return (
    ct.startsWith('text/') ||
    ct.includes('application/json') ||
    ct.includes('application/xml') ||
    ct.includes('application/javascript') ||
    ct.includes('+xml') ||
    ct.includes('+json')
  );
}

/** Returns true if the Content-Type is application/pdf. */
export function isPdfContentType(contentType: string): boolean {
  return contentType.toLowerCase().includes('application/pdf');
}

/**
 * Fetches a URL and returns the raw response bytes plus Content-Type.
 * Throws on network errors, non-2xx status, missing Content-Type,
 * or responses exceeding the size limit. Does NOT filter by content type
 * or decode bytes — callers handle conversion.
 */
export async function fetchBody(
  url: string,
  options: FetchBodyOptions,
): Promise<FetchBodyResult> {
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    abortController.abort(new Error('Request timed out'));
  }, options.timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      signal: abortController.signal,
      headers: options.headers,
    });
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    throw error;
  }

  if (!response.ok) {
    clearTimeout(timeoutId);
    throw new Error(
      `HTTP ${response.status.toString()} ${response.statusText}`,
    );
  }

  const contentType = response.headers.get('content-type');
  if (!contentType) {
    clearTimeout(timeoutId);
    throw new Error('Response has no Content-Type header');
  }

  const contentLength = response.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > options.maxResponseSize) {
    clearTimeout(timeoutId);
    throw new Error(
      `Response too large (exceeds ${(options.maxResponseSize / 1024 / 1024).toString()}MB limit)`,
    );
  }

  if (!response.body) {
    clearTimeout(timeoutId);
    throw new Error('Response body is not readable');
  }

  const reader = response.body;
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    for await (const chunk of reader) {
      totalBytes += chunk.byteLength;
      if (totalBytes > options.maxResponseSize) {
        throw new Error(
          `Response too large (exceeds ${(options.maxResponseSize / 1024 / 1024).toString()}MB limit)`,
        );
      }
      chunks.push(chunk);
    }
  } catch (error: unknown) {
    abortController.abort();
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  return {body: Buffer.concat(chunks), contentType};
}
```

- [ ] **Step 2: Update `web-fetch.ts` to decode bytes locally and reject non-text-non-PDF**

In `apps/backend/src/agent/tools/web/web-fetch.ts`:

1. Add `isTextContentType` to the existing `./helpers.js` import:

```ts
import {fetchBody, isTextContentType} from './helpers.js';
```

2. Replace the variable declarations and fetch+conversion block (currently lines ~112–149) with:

```ts
let bodyBytes: Buffer;
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
  bodyBytes = result.body;
  contentType = result.contentType;
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    data: {message: `Failed to fetch URL: ${message}`},
    content: `Error: Failed to fetch URL: ${message}`,
    status: 'failure',
  };
}

const includeFullPage = args.includeFullPage ?? false;

let title: string | undefined;
let content: string;
let note: string | undefined;

if (contentType.toLowerCase().includes('text/html')) {
  const body = new TextDecoder().decode(bodyBytes);
  const result = htmlToMarkdown(body, includeFullPage);
  title = result.title;
  content = result.content;
  if (result.fellBack) {
    note = 'Article extraction failed; showing full page content instead.';
  }
} else if (isTextContentType(contentType)) {
  content = new TextDecoder().decode(bodyBytes);
} else {
  const message = `Unsupported content type: ${contentType}`;
  return {
    data: {message},
    content: `Error: ${message}`,
    status: 'failure',
  };
}
```

(Task 3 will replace the `else` branch above with PDF handling.)

- [ ] **Step 3: Update `web-fetch-raw.ts` to decode bytes locally and reject non-text**

In `apps/backend/src/agent/tools/web/web-fetch-raw.ts`:

1. Add `isTextContentType` to the existing `./helpers.js` import:

```ts
import {fetchBody, isTextContentType} from './helpers.js';
```

2. Replace the fetch block (currently lines ~53–71) with:

```ts
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
  if (!isTextContentType(result.contentType)) {
    const message = `Unsupported content type: ${result.contentType}`;
    return {
      data: {message},
      content: `Error: ${message}`,
      status: 'failure',
    };
  }
  body = new TextDecoder().decode(result.body);
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    data: {message: `Failed to fetch URL: ${message}`},
    content: `Error: Failed to fetch URL: ${message}`,
    status: 'failure',
  };
}
```

- [ ] **Step 4: Run the existing test suite to verify no regression**

```bash
cd apps/backend && bunx vitest run src/agent/tools/web
```

Expected: all existing tests pass. The "non-text content types" tests still pass because the failure path now lives in the tool layer (with the same `Unsupported content type:` substring), so the existing assertions match.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/agent/tools/web/helpers.ts \
        apps/backend/src/agent/tools/web/web-fetch.ts \
        apps/backend/src/agent/tools/web/web-fetch-raw.ts
git commit -m "refactor(backend): move content decoding from fetchBody into web tools"
```

---

### Task 3: Wire PDF branch into `web_fetch`

**Files:**

- Modify: `apps/backend/src/agent/tools/web/web-fetch.ts`

- [ ] **Step 1: Write the failing test**

Append to `apps/backend/src/agent/tools/web/web-fetch.test.ts` inside the existing top-level `describe('webFetchTool', ...)` block, after the `'non-HTML content'` describe:

```ts
describe('PDF content', () => {
  const HELLO_PDF_BASE64 =
    'JVBERi0xLjQKMSAwIG9iago8PC9UeXBlIC9DYXRhbG9nIC9QYWdlcyAyIDAgUj4+CmVuZG9iago' +
    'yIDAgb2JqCjw8L1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDE+PgplbmRvYmoKMyAwIG9iago' +
    '8PC9UeXBlIC9QYWdlIC9QYXJlbnQgMiAwIFIgL01lZGlhQm94IFswIDAgMzAwIDE0NF0gL0NvbnRlbnRzIDQgMCBSIC9SZXNvdXJjZXMgPDwvRm9udCA8PC9GMSA1IDAgUj4+Pj4+PgplbmRvYmoKNCAwIG9iago' +
    '8PC9MZW5ndGggNTU+PnN0cmVhbQpCVAovRjEgMTggVGYKMzAgNzAgVGQKKEhlbGxvIFBERikgVGoKRVQKZW5kc3RyZWFtCmVuZG9iago' +
    'NSAwIG9iago8PC9UeXBlIC9Gb250IC9TdWJ0eXBlIC9UeXBlMSAvQmFzZUZvbnQgL0hlbHZldGljYT4+CmVuZG9iagp4cmVmCjAgNgowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMTAgMDAwMDAgbiAKMDAwMDAwMDA1OSAwMDAwMCBuIAowMDAwMDAwMTEwIDAwMDAwIG4gCjAwMDAwMDAyMTcgMDAwMDAgbiAKMDAwMDAwMDMyMyAwMDAwMCBuIAp0cmFpbGVyCjw8L1NpemUgNiAvUm9vdCAxIDAgUj4+CnN0YXJ0eHJlZgozOTQKJSVFT0YK';

  it('extracts text from PDF responses', async () => {
    const pdfBytes = Buffer.from(HELLO_PDF_BASE64, 'base64');
    const server = createTestServer('application/pdf', pdfBytes);
    await startServer(server);

    try {
      const result = await webFetchTool.execute(
        {url: serverUrl(server)},
        context,
      );
      expect(result.status).toBe('success');
      assert(result.status === 'success');
      expect(result.content).toContain('URL:');
      expect(result.content).toContain('Hello PDF');
      expect(result.data.url).toBe(serverUrl(server));
      expect(result.data.content).toContain('Hello PDF');
    } finally {
      await stopServer(server);
    }
  });

  it('returns failure when PDF parsing fails', async () => {
    const server = createTestServer(
      'application/pdf',
      Buffer.from('not actually a pdf', 'utf-8'),
    );
    await startServer(server);

    try {
      const result = await webFetchTool.execute(
        {url: serverUrl(server)},
        context,
      );
      expect(result.status).toBe('failure');
      assert(result.status === 'failure');
      expect(result.data.message).toMatch(/Failed to parse PDF/i);
    } finally {
      await stopServer(server);
    }
  });
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

```bash
cd apps/backend && bunx vitest run src/agent/tools/web/web-fetch.test.ts -t "PDF content"
```

Expected: FAIL — current `web-fetch.ts` rejects `application/pdf` as `Unsupported content type`.

- [ ] **Step 3: Add the PDF branch in `web-fetch.ts`**

In `apps/backend/src/agent/tools/web/web-fetch.ts`:

1. Add `unpdf` import at the top of the file, alongside the existing third-party imports:

```ts
import {extractText, getDocumentProxy} from 'unpdf';
```

2. Update the `./helpers.js` import to include `isPdfContentType`:

```ts
import {fetchBody, isPdfContentType, isTextContentType} from './helpers.js';
```

3. Add a private `pdfToText` function near the existing private `htmlToMarkdown` (i.e., as a sibling top-level function in the same file, not inside the tool object). Place it directly after `htmlToMarkdown`'s closing brace:

```ts
async function pdfToText(buffer: Buffer): Promise<string> {
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>>;
  try {
    pdf = await getDocumentProxy(new Uint8Array(buffer));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse PDF: ${message}`);
  }
  const {text} = await extractText(pdf, {mergePages: true});
  return Array.isArray(text) ? text.join('\n\n') : text;
}
```

4. Update the `Accept` header to advertise PDF support:

```ts
          Accept: 'text/html, application/json, application/pdf, text/plain, */*',
```

5. Replace the conversion `if/else if/else` block from Task 2, Step 2 with:

```ts
if (contentType.toLowerCase().includes('text/html')) {
  const body = new TextDecoder().decode(bodyBytes);
  const result = htmlToMarkdown(body, includeFullPage);
  title = result.title;
  content = result.content;
  if (result.fellBack) {
    note = 'Article extraction failed; showing full page content instead.';
  }
} else if (isPdfContentType(contentType)) {
  try {
    content = await pdfToText(bodyBytes);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      data: {message},
      content: `Error: ${message}`,
      status: 'failure',
    };
  }
} else if (isTextContentType(contentType)) {
  content = new TextDecoder().decode(bodyBytes);
} else {
  const message = `Unsupported content type: ${contentType}`;
  return {
    data: {message},
    content: `Error: ${message}`,
    status: 'failure',
  };
}
```

6. Update the tool description to mention PDF support (per the per-directory CLAUDE.md, keep it generic and abstract — no enumerations of file types):

```ts
  description:
    'Fetches a URL and returns its content in a readable format. ' +
    'HTML pages are converted to Markdown with article extraction. ' +
    'PDF documents are converted to plain text. ' +
    'Other text content (JSON, plain text, XML) is returned as-is. ' +
    'Use this when you already know the URL to retrieve, ' +
    'rather than needing to discover information.',
```

- [ ] **Step 4: Run the new PDF tests to verify they pass**

```bash
cd apps/backend && bunx vitest run src/agent/tools/web/web-fetch.test.ts -t "PDF content"
```

Expected: both PDF tests PASS.

- [ ] **Step 5: Run the full web-tools test suite to verify no regressions**

```bash
cd apps/backend && bunx vitest run src/agent/tools/web
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/agent/tools/web/web-fetch.ts \
        apps/backend/src/agent/tools/web/web-fetch.test.ts
git commit -m "feat(backend): support PDF URLs in web_fetch tool"
```

---

### Task 4: Verify large-PDF fallback uses the temp-file path

This is verification-only — no code changes. Confirms that PDFs whose extracted text exceeds 32 KB are written to a temp file by the existing downstream code, with no special-casing needed.

**Files:**

- Modify: `apps/backend/src/agent/tools/web/web-fetch.test.ts` (add one test)

- [ ] **Step 1: Add the test**

Append inside the `describe('PDF content', ...)` block from Task 3:

```ts
it('writes extracted PDF text to a temp file when over 32KB', async () => {
  // Build a PDF whose decoded text content exceeds 32KB by repeating the
  // content stream. We synthesize the PDF inline rather than checking in a
  // large fixture file.
  const repeated = 'A'.repeat(40_000);
  const stream = `BT /F1 12 Tf 30 700 Td (${repeated}) Tj ET`;
  const streamLen = Buffer.byteLength(stream);
  const pdf = [
    '%PDF-1.4',
    '1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj',
    '2 0 obj <</Type /Pages /Kids [3 0 R] /Count 1>> endobj',
    '3 0 obj <</Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources <</Font <</F1 5 0 R>>>>>> endobj',
    `4 0 obj <</Length ${streamLen.toString()}>> stream`,
    stream,
    'endstream endobj',
    '5 0 obj <</Type /Font /Subtype /Type1 /BaseFont /Helvetica>> endobj',
    'trailer <</Size 6 /Root 1 0 R>>',
    '%%EOF',
  ].join('\n');

  const server = createTestServer('application/pdf', Buffer.from(pdf));
  await startServer(server);

  try {
    const result = await webFetchTool.execute(
      {url: serverUrl(server)},
      context,
    );
    expect(result.status).toBe('success');
    assert(result.status === 'success');
    expect(result.content).toContain('Content saved to file:');
  } finally {
    await stopServer(server);
  }
});
```

> If `unpdf` rejects this hand-rolled large-content PDF as malformed, replace the synthesis with reading a real multi-page PDF fixture from `__fixtures__/large.pdf` instead. The point of the test is the temp-file branch, not PDF synthesis fidelity.

- [ ] **Step 2: Run the test**

```bash
cd apps/backend && bunx vitest run src/agent/tools/web/web-fetch.test.ts -t "temp file"
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/agent/tools/web/web-fetch.test.ts
git commit -m "test(backend): cover large-PDF temp-file fallback in web_fetch"
```

---

### Task 5: Final lint, typecheck, and full test pass

**Files:** none

- [ ] **Step 1: Lint**

```bash
cd apps/backend && bun run lint
```

Expected: no errors.

- [ ] **Step 2: Typecheck**

```bash
cd apps/backend && bun run typecheck
```

Expected: no errors.

- [ ] **Step 3: Full backend test suite**

```bash
cd apps/backend && bun run test
```

Expected: all tests pass.

- [ ] **Step 4: If lint/format/typecheck made changes, commit them**

```bash
git status
# If anything is modified:
git add -A && git commit -m "chore(backend): lint/format after PDF support"
```

---

## Self-Review Notes

- **Spec coverage:** the user's spec was a chat exchange — "extend the content converting part so PDF is converted to text, reuse downstream size limits, fetch layer should not touch content." Tasks 2 + 3 cover this end-to-end: Task 2 separates fetch from conversion, Task 3 adds the inline `pdfToText` converter (sibling of the existing private `htmlToMarkdown`) and wires it into the conversion branch. Task 4 verifies size-limit reuse works. Task 5 is the final clean-up gate.
- **`web_fetch_raw` intentionally does not extract PDFs** — its contract is "no conversion." Task 2 keeps its existing behavior (rejects non-text content types), just moves the rejection to the tool layer.
- **Tool description rules:** the per-directory CLAUDE.md at `apps/backend/src/agent/tools/CLAUDE.md` says descriptions must be generic and avoid enumerating examples. The updated description in Task 3 stays at the same abstraction level as the existing one (it lists HTML/PDF/text as format families, mirroring the existing `JSON, plain text, XML` parenthetical that's already there).
- **Why `pdfToText` lives inline in `web-fetch.ts`:** mirrors the existing `htmlToMarkdown` precedent in the same file. Both functions have one caller (the tool's `execute`), are small, and are exercised end-to-end by `web-fetch.test.ts`. A separate `pdf-to-text.ts` would create asymmetry with `htmlToMarkdown` and add ceremony without benefit.
- **No frontend changes needed:** `WebFetchResult.content` is a string and the React display components render it as-is. PDFs land in the same shape as HTML/text results.
