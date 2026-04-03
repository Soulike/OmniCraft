import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import {afterAll, afterEach, beforeAll, describe, expect, it} from 'vitest';

import {fetchBody, isTextContentType, writeToTempFile} from './helpers.js';
import {
  createTestServer,
  serverUrl,
  startServer,
  stopServer,
} from './testing.js';

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

    beforeAll(async () => {
      server = createTestServer('text/html; charset=utf-8', '<h1>Hello</h1>');
      await startServer(server);
    });

    afterAll(async () => {
      await stopServer(server);
    });

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
      await startServer(server);

      try {
        await expect(fetchBody(serverUrl(server), opts)).rejects.toThrow(
          'Unsupported content type',
        );
      } finally {
        await stopServer(server);
      }
    });

    it('throws for HTTP error status', async () => {
      const server = createTestServer('text/plain', 'Not Found', 404);
      await startServer(server);

      try {
        await expect(fetchBody(serverUrl(server), opts)).rejects.toThrow('404');
      } finally {
        await stopServer(server);
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
