import assert from 'node:assert';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {toolResultBlocksToText} from '@/agent-core/llm-api/index.js';
import {createMockContext} from '@/agent-core/tool/testing.js';
import type {ToolExecutionContext} from '@/agent-core/tool/types.js';

import {
  createTestServer,
  serverUrl,
  startServer,
  stopServer,
} from './testing.js';
import {webFetchTool} from './web-fetch.js';

describe('webFetchTool', () => {
  let tmpDir: string;
  let scratchDir: string;
  let context: ToolExecutionContext;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wf-test-'));
    scratchDir = await fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), 'wf-scratch-')),
    );
    context = createMockContext({
      workingDirectory: tmpDir,
      scratchDirectory: scratchDir,
    });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, {recursive: true, force: true});
    await fs.rm(scratchDir, {recursive: true, force: true});
  });

  it('has the correct name', () => {
    expect(webFetchTool.name).toBe('web_fetch');
  });

  describe('HTML content', () => {
    it('converts HTML to Markdown and extracts title', async () => {
      const html = `<!DOCTYPE html>
<html>
  <head><title>Test Page</title></head>
  <body>
    <article>
      <h1>Hello World</h1>
      <p>This is a test paragraph with enough content to be extracted by Readability.</p>
      <p>More content here to ensure the article is long enough for extraction.</p>
    </article>
  </body>
</html>`;
      const server = createTestServer('text/html; charset=utf-8', html);
      await startServer(server);

      try {
        const result = await webFetchTool.execute(
          {url: serverUrl(server), includeFullPage: false},
          context,
        );
        expect(toolResultBlocksToText(result.content)).toContain('URL:');
        expect(toolResultBlocksToText(result.content)).toContain('Hello World');
        expect(result.status).toBe('success');
        assert(result.status === 'success');
        expect(result.data.url).toBe(serverUrl(server));
        expect(result.data.content).toBeTruthy();
      } finally {
        await stopServer(server);
      }
    });

    it('includes full page when includeFullPage=true', async () => {
      const html = `<!DOCTYPE html>
<html>
  <head><title>Full Page Test</title></head>
  <body>
    <nav><a href="/">Home</a></nav>
    <article>
      <h1>Main Content</h1>
      <p>Article body text.</p>
    </article>
    <footer>Footer text</footer>
  </body>
</html>`;
      const server = createTestServer('text/html; charset=utf-8', html);
      await startServer(server);

      try {
        const result = await webFetchTool.execute(
          {url: serverUrl(server), includeFullPage: true},
          context,
        );
        expect(toolResultBlocksToText(result.content)).toContain('URL:');
        expect(toolResultBlocksToText(result.content)).toContain(
          'Main Content',
        );
        expect(result.status).toBe('success');
        assert(result.status === 'success');
        expect(result.data.url).toBe(serverUrl(server));
        expect(result.data.content).toBeTruthy();
      } finally {
        await stopServer(server);
      }
    });
  });

  describe('non-HTML content', () => {
    it('returns JSON content as-is without a Title line', async () => {
      const json = JSON.stringify({key: 'value', count: 42});
      const server = createTestServer('application/json', json);
      await startServer(server);

      try {
        const result = await webFetchTool.execute(
          {url: serverUrl(server)},
          context,
        );
        expect(toolResultBlocksToText(result.content)).toContain('URL:');
        expect(toolResultBlocksToText(result.content)).not.toContain('Title:');
        expect(toolResultBlocksToText(result.content)).toContain('"key"');
        expect(toolResultBlocksToText(result.content)).toContain('"value"');
        expect(result.status).toBe('success');
        assert(result.status === 'success');
        expect(result.data.url).toBe(serverUrl(server));
        expect(result.data.content).toBeTruthy();
      } finally {
        await stopServer(server);
      }
    });
  });

  describe('PDF content', () => {
    function buildPdf(streamContent: string, mediaBox = '0 0 300 144'): Buffer {
      const streamLen = Buffer.byteLength(streamContent, 'latin1');
      const objects = [
        '<</Type /Catalog /Pages 2 0 R>>',
        '<</Type /Pages /Kids [3 0 R] /Count 1>>',
        `<</Type /Page /Parent 2 0 R /MediaBox [${mediaBox}] /Contents 4 0 R /Resources <</Font <</F1 5 0 R>>>>>>`,
        `<</Length ${streamLen.toString()}>>\nstream\n${streamContent}endstream`,
        '<</Type /Font /Subtype /Type1 /BaseFont /Helvetica>>',
      ];
      const header = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
      let body = '';
      const offsets: number[] = [];
      for (let i = 0; i < objects.length; i++) {
        offsets.push(Buffer.byteLength(header + body, 'latin1'));
        body += `${(i + 1).toString()} 0 obj\n${objects[i]}\nendobj\n`;
      }
      const xrefOffset = Buffer.byteLength(header + body, 'latin1');
      let xref = `xref\n0 ${(objects.length + 1).toString()}\n0000000000 65535 f \n`;
      for (const off of offsets) {
        xref += `${off.toString().padStart(10, '0')} 00000 n \n`;
      }
      const trailer = `trailer\n<</Size ${(objects.length + 1).toString()} /Root 1 0 R>>\nstartxref\n${xrefOffset.toString()}\n%%EOF\n`;
      return Buffer.from(header + body + xref + trailer, 'latin1');
    }

    function buildPdfWithText(text: string): Buffer {
      return buildPdf(`BT\n/F1 18 Tf\n30 70 Td\n(${text}) Tj\nET\n`);
    }

    function buildPdfWithManyTextShows(
      perLineText: string,
      lineCount: number,
    ): Buffer {
      // Start near bottom-left and move up; PDF origin is bottom-left, so
      // moving with positive Y keeps subsequent text on-page.
      const lines: string[] = ['BT', '/F1 18 Tf', '30 30 Td'];
      for (let i = 0; i < lineCount; i++) {
        // Make each line unique to avoid any text-deduplication in extractors.
        lines.push(`(${i.toString().padStart(6, '0')}-${perLineText}) Tj`);
        lines.push('0 20 Td');
      }
      lines.push('ET');
      const streamContent = `${lines.join('\n')}\n`;
      // Use a very tall MediaBox so all lines stay on-page; some PDF text
      // extractors skip text that falls outside the page bounds.
      return buildPdf(streamContent, '0 0 10000 1000000');
    }

    it('extracts text from PDF responses', async () => {
      const pdfBytes = buildPdfWithText('Hello PDF');
      const server = createTestServer('application/pdf', pdfBytes);
      await startServer(server);

      try {
        const result = await webFetchTool.execute(
          {url: serverUrl(server)},
          context,
        );
        expect(result.status).toBe('success');
        assert(result.status === 'success');
        expect(toolResultBlocksToText(result.content)).toContain('URL:');
        expect(toolResultBlocksToText(result.content)).toContain('Hello PDF');
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

    it('writes extracted PDF text to a temp file when over 32KB', async () => {
      // Use many separate text-show operators because PDF.js truncates
      // the extracted text from a single very long Tj. ~3000 lines of 20
      // chars each yields well over 32KB of extracted text.
      const pdfBytes = buildPdfWithManyTextShows('A'.repeat(20), 3000);
      const server = createTestServer('application/pdf', pdfBytes);
      await startServer(server);

      try {
        const result = await webFetchTool.execute(
          {url: serverUrl(server)},
          context,
        );
        expect(result.status).toBe('success');
        assert(result.status === 'success');
        expect(toolResultBlocksToText(result.content)).toContain(
          'Content saved to file:',
        );
      } finally {
        await stopServer(server);
      }
    });
  });

  describe('error cases', () => {
    it('returns an error for ftp:// URLs', async () => {
      const result = await webFetchTool.execute(
        {url: 'ftp://files.example.com/data'},
        context,
      );
      expect(toolResultBlocksToText(result.content)).toContain('ftp:');
      expect(result.status).toBe('failure');
      assert(result.status === 'failure');
      expect(result.data.message).toBeTruthy();
    });

    it('returns an error for non-text content types', async () => {
      const server = createTestServer('image/png', 'fake-png-bytes');
      await startServer(server);

      try {
        const result = await webFetchTool.execute(
          {url: serverUrl(server)},
          context,
        );
        expect(toolResultBlocksToText(result.content)).toContain(
          'Unsupported content type',
        );
        expect(result.status).toBe('failure');
        assert(result.status === 'failure');
        expect(result.data.message).toBeTruthy();
      } finally {
        await stopServer(server);
      }
    });

    it('returns an error when connection fails', async () => {
      const result = await webFetchTool.execute(
        {url: 'http://127.0.0.1:1'},
        context,
      );
      expect(toolResultBlocksToText(result.content)).toContain(
        'Failed to fetch URL',
      );
      expect(result.status).toBe('failure');
      assert(result.status === 'failure');
      expect(result.data.message).toBeTruthy();
    });
  });

  describe('large content fallback', () => {
    it('writes content to temp file when exceeding 32KB', async () => {
      const largeBody = 'x'.repeat(40_000);
      const html = `<!DOCTYPE html><html><head><title>Large</title></head><body><article><p>${largeBody}</p></article></body></html>`;
      const server = createTestServer('text/html; charset=utf-8', html);
      await startServer(server);

      try {
        const result = await webFetchTool.execute(
          {url: serverUrl(server)},
          context,
        );
        expect(toolResultBlocksToText(result.content)).toContain(
          'Content saved to file:',
        );
        expect(toolResultBlocksToText(result.content)).toContain('URL:');
        expect(result.status).toBe('success');
        assert(result.status === 'success');
        expect(result.data.url).toBe(serverUrl(server));
        expect(result.data.content).toBeTruthy();
        expect(result.data.content).toContain(scratchDir);
      } finally {
        await stopServer(server);
      }
    });
  });

  describe('Readability fallback', () => {
    it('falls back to full page with note when extraction fails', async () => {
      const html = '<html><head></head><body></body></html>';
      const server = createTestServer('text/html; charset=utf-8', html);
      await startServer(server);

      try {
        const result = await webFetchTool.execute(
          {url: serverUrl(server)},
          context,
        );
        expect(toolResultBlocksToText(result.content)).toContain(
          'Note: Article extraction failed',
        );
        expect(result.status).toBe('success');
        assert(result.status === 'success');
        expect(result.data.url).toBe(serverUrl(server));
      } finally {
        await stopServer(server);
      }
    });
  });
});
