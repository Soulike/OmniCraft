# Web Fetch Tools Design

## Overview

Two tools in the `WebToolSet` for fetching URL content:

- **`web_fetch`** — Fetches a URL and returns LLM-friendly text. HTML pages are
  converted to Markdown via Readability + Turndown; other text types are returned
  as-is.
- **`web_fetch_raw`** — Fetches a URL and returns the raw text content with no
  conversion.

## Tool Interface

**Name:** `web_fetch`

### Parameters

| Parameter         | Type          | Required | Description                                                                                                                                                                       |
| ----------------- | ------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `url`             | `z.url()`     | Yes      | The URL to fetch.                                                                                                                                                                 |
| `includeFullPage` | `z.boolean()` | No       | Defaults to `false`. When `false`, only the main article content is extracted. Set to `true` to include the full page content if extraction is incomplete or missing information. |

### Response Format

All responses share the same format:

```
URL: <url>
Title: <title>

<content>
```

- **≤ 32 KB:** Content is returned inline as `<content>`.
- **> 32 KB:** Content is written to a temporary file. The response becomes:

```
URL: <url>
Title: <title>
Content saved to file: <temporary file path>
```

The LLM can then read the file using its available file-reading tools.

### Title Extraction

- **HTML pages:** From the Readability result's `title` field, falling back to
  the `<title>` element.
- **Non-HTML text:** No title is available. The `Title:` line is omitted from
  the response.

## web_fetch_raw Tool Interface

**Name:** `web_fetch_raw`

### Parameters

| Parameter | Type      | Required | Description       |
| --------- | --------- | -------- | ----------------- |
| `url`     | `z.url()` | Yes      | The URL to fetch. |

### Behavior

Fetches the URL and returns the raw text content with no conversion. No
Readability extraction, no Markdown conversion. What the server returns is what
the LLM gets.

The tool description shown to the LLM should indicate that `web_fetch` is
preferred for most use cases, and `web_fetch_raw` should only be used when
unprocessed content is specifically needed (e.g., inspecting raw HTML structure).

### Response Format

Same structure as `web_fetch`:

```
URL: <url>

<raw content>
```

The `Title:` line is always omitted since no title extraction is performed.

- **≤ 32 KB:** Content is returned inline.
- **> 32 KB:** Content is written to a temporary file with the same fallback
  message as `web_fetch`.

### Shared Logic

`web_fetch_raw` reuses the same HTTP request infrastructure as `web_fetch`:
URL validation, timeout, response size limit, text content-type check. Only the
content processing step is skipped.

## URL Validator

URL validation is a separate module (`url-validator.ts`), not inline logic in
the tool. It owns all validation rules and error messages.

Current rules:

- Only `http:` and `https:` protocols are allowed.

The module is designed for future expansion (e.g., domain blocklists, URL
normalization).

## HTTP Request

- **Method:** Global `fetch` (Node.js API, provided by Bun runtime).
- **Timeout:** 30 seconds via `AbortSignal.timeout(30_000)`.
- **Response size limit:** 5 MB. Checked via `Content-Length` header when
  available, otherwise enforced by accumulating bytes during streaming reads.
- **Redirects:** Followed (default `fetch` behavior).

## Content Processing

### Content-Type Routing

| Content-Type                                                             | Processing                                  |
| ------------------------------------------------------------------------ | ------------------------------------------- |
| `text/html`                                                              | Readability + Turndown pipeline (see below) |
| Other text types (`text/*`, `application/json`, `application/xml`, etc.) | Used as-is                                  |
| Non-text types (images, binaries, etc.)                                  | Return error                                |

### HTML Pipeline

```
HTML string
  → linkedom: parse into DOM
  → includeFullPage=false: Readability extracts article DOM
    includeFullPage=true: skip, use full DOM
  → Turndown: convert DOM to Markdown
  → Extract title (from Readability result or <title> element)
```

If Readability extraction fails, the tool automatically falls back to full-page
conversion and includes a note in the response indicating the fallback.

## Temporary File Strategy

- **Directory:** `<os.tmpdir()>/omnicraft-web-fetch/`
- **File naming:** `<random UUID>.md`
- **Lifecycle:** No active cleanup; relies on OS temporary directory management.

## ToolExecutionContext Changes

### New Type: AllowedPath

```ts
interface AllowedPath {
  /** Absolute path of the allowed directory. */
  readonly path: string;
  /** 'read' = read-only, 'read-write' = read and write. */
  readonly mode: 'read' | 'read-write';
}
```

### New Field: extraAllowedPaths

Added to `ToolExecutionContext`:

```ts
/** Additional paths the agent is allowed to access beyond workingDirectory.
 *  workingDirectory is always read-write and should NOT be listed here. */
readonly extraAllowedPaths: readonly AllowedPath[];
```

`workingDirectory` remains unchanged. It is always read-write, serves as the
base for resolving relative paths, and will be used as the cwd for future Bash
tools. It does not appear in `extraAllowedPaths`.

The `Agent` base class automatically includes `os.tmpdir()` as read-write in
`extraAllowedPaths`. Subclasses pass additional paths via `AgentOptions`, which
the base class appends after the tmpdir entry.

### read_file Path Validation Change

Current logic checks only `workingDirectory`. New logic:

1. Check if the target path is under `workingDirectory` → allow (any
   operation).
2. Check if the target path is under any entry in `extraAllowedPaths` → allow
   if the operation matches the entry's `mode`.
3. Otherwise → deny access.

## Error Handling

All errors are returned as strings prefixed with `Error:` (consistent with
`read_file`). No exceptions are thrown to the caller.

| Scenario                    | Response                                           |
| --------------------------- | -------------------------------------------------- |
| Invalid URL protocol        | Error message determined by `url-validator` module |
| Network failure / timeout   | `Error: Failed to fetch URL: <reason>`             |
| Response exceeds 5 MB       | `Error: Response too large (exceeds 5MB limit)`    |
| Non-text Content-Type       | `Error: Unsupported content type: <type>`          |
| Readability extraction fail | Auto-fallback to full page with note               |

## New Dependencies

Added to `apps/backend`:

- `@mozilla/readability` — Article content extraction (Firefox Reader Mode
  engine)
- `linkedom` — Lightweight DOM implementation for server-side HTML parsing
- `turndown` — HTML to Markdown conversion

## File Changes

### New Files

| File                                        | Purpose                                       |
| ------------------------------------------- | --------------------------------------------- |
| `agent/tool-sets/web/url-validator.ts`      | URL protocol validation module                |
| `agent/tool-sets/web/web-fetch.ts`          | `web_fetch` tool definition and execution     |
| `agent/tool-sets/web/web-fetch-raw.ts`      | `web_fetch_raw` tool definition and execution |
| `agent/tool-sets/web/url-validator.test.ts` | URL validator tests                           |
| `agent/tool-sets/web/web-fetch.test.ts`     | web_fetch tool tests                          |
| `agent/tool-sets/web/web-fetch-raw.test.ts` | web_fetch_raw tool tests                      |

### Modified Files

| File                                  | Change                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------ |
| `agent-core/tool/types.ts`            | Add `AllowedPath` type and `extraAllowedPaths` to `ToolExecutionContext` |
| `agent-core/tool/testing.ts`          | Add `extraAllowedPaths` default to mock context                          |
| `agent-core/agent/agent.ts`           | Pass `extraAllowedPaths` when building `ToolExecutionContext`            |
| `agent-core/agent/types.ts`           | Add `extraAllowedPaths` to `AgentOptions`                                |
| `agent/tools/file/read-file.ts`       | Extend path validation to check `extraAllowedPaths`                      |
| `agent/tool-sets/web/web-tool-set.ts` | Register `webFetchTool` and `webFetchRawTool` in constructor             |
| `agent/tool-sets/web/index.ts`        | Update barrel exports                                                    |
