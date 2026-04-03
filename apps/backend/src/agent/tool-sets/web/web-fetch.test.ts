import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

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
        expect(result).toContain('URL:');
        expect(result).toContain('Hello World');
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
        expect(result).toContain('URL:');
        expect(result).toContain('Main Content');
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
        expect(result).toContain('URL:');
        expect(result).not.toContain('Title:');
        expect(result).toContain('"key"');
        expect(result).toContain('"value"');
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
      expect(result).toContain('ftp:');
    });

    it('returns an error for non-text content types', async () => {
      const server = createTestServer('image/png', 'fake-png-bytes');
      await startServer(server);

      try {
        const result = await webFetchTool.execute(
          {url: serverUrl(server)},
          context,
        );
        expect(result).toContain('Unsupported content type');
      } finally {
        await stopServer(server);
      }
    });

    it('returns an error when connection fails', async () => {
      const result = await webFetchTool.execute(
        {url: 'http://127.0.0.1:1'},
        context,
      );
      expect(result).toContain('Failed to fetch URL');
    });
  });
});
