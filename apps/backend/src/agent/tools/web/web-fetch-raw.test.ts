import http from 'node:http';

import {afterAll, beforeAll, describe, expect, it} from 'vitest';

import {createMockContext} from '@/agent-core/tool/testing.js';

import {
  createTestServer,
  serverUrl,
  startServer,
  stopServer,
} from './testing.js';
import {webFetchRawTool} from './web-fetch-raw.js';

describe('webFetchRawTool', () => {
  it('has the correct tool name', () => {
    expect(webFetchRawTool.name).toBe('web_fetch_raw');
  });

  describe('returns raw HTML without conversion', () => {
    let server: http.Server;
    const rawHtml =
      '<html><head><title>My Page</title></head><body><h1>Hello World</h1></body></html>';

    beforeAll(async () => {
      server = createTestServer('text/html; charset=utf-8', rawHtml);
      await startServer(server);
    });

    afterAll(async () => {
      await stopServer(server);
    });

    it('returns raw HTML tags without title extraction', async () => {
      const result = await webFetchRawTool.execute(
        {url: serverUrl(server)},
        createMockContext(),
      );
      expect(result.content).toContain('<html>');
      expect(result.content).toContain('<h1>Hello World</h1>');
      expect(result.status).toBe('success');
    });

    it('does not add a Title: line header', async () => {
      const result = await webFetchRawTool.execute(
        {url: serverUrl(server)},
        createMockContext(),
      );
      expect(result.content).not.toMatch(/^Title:/m);
      expect(result.status).toBe('success');
    });
  });

  describe('returns JSON as-is', () => {
    let server: http.Server;
    const jsonBody = JSON.stringify({key: 'value', count: 42});

    beforeAll(async () => {
      server = createTestServer('application/json', jsonBody);
      await startServer(server);
    });

    afterAll(async () => {
      await stopServer(server);
    });

    it('returns the raw JSON string', async () => {
      const result = await webFetchRawTool.execute(
        {url: serverUrl(server)},
        createMockContext(),
      );
      expect(result.content).toContain(jsonBody);
      expect(result.status).toBe('success');
    });
  });

  describe('rejects unsupported protocols', () => {
    it('rejects ftp:// protocol', async () => {
      const result = await webFetchRawTool.execute(
        {url: 'ftp://files.example.com/data'},
        createMockContext(),
      );
      expect(result.content).toMatch(/Error/i);
      expect(result.content).toContain('ftp:');
      expect(result.status).toBe('failure');
    });
  });

  describe('returns error for non-text content types', () => {
    let server: http.Server;

    beforeAll(async () => {
      server = createTestServer(
        'image/png',
        Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      );
      await startServer(server);
    });

    afterAll(async () => {
      await stopServer(server);
    });

    it('returns an error message for binary content', async () => {
      const result = await webFetchRawTool.execute(
        {url: serverUrl(server)},
        createMockContext(),
      );
      expect(result.content).toMatch(/Error/i);
      expect(result.status).toBe('failure');
    });
  });

  describe('large content fallback', () => {
    it('writes content to temp file when exceeding 32KB', async () => {
      const largeBody = 'x'.repeat(40_000);
      const server = createTestServer('text/plain', largeBody);
      await startServer(server);

      try {
        const result = await webFetchRawTool.execute(
          {url: serverUrl(server)},
          createMockContext(),
        );
        expect(result.content).toContain('Content saved to file:');
        expect(result.content).toContain('URL:');
        expect(result.status).toBe('success');
      } finally {
        await stopServer(server);
      }
    });
  });
});
