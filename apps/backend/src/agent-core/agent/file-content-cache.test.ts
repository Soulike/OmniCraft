import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {FileContentCache} from './file-content-cache.js';

describe('FileContentCache', () => {
  let tmpDir: string;
  let cache: FileContentCache;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fcc-test-'));
    cache = new FileContentCache();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  async function writeFile(name: string, content: string): Promise<string> {
    const filePath = path.join(tmpDir, name);
    await fs.writeFile(filePath, content);
    return filePath;
  }

  describe('get', () => {
    it('returns undefined for a path that was never cached', async () => {
      const filePath = path.join(tmpDir, 'nonexistent.txt');
      expect(await cache.get(filePath)).toBeUndefined();
    });

    it('returns cached content when file has not changed', async () => {
      const filePath = await writeFile('a.txt', 'hello');
      await cache.set(filePath, 'hello');
      expect(await cache.get(filePath)).toBe('hello');
    });

    it('returns undefined and invalidates when file mtime changes', async () => {
      const filePath = await writeFile('a.txt', 'v1');
      await cache.set(filePath, 'v1');

      await new Promise((r) => setTimeout(r, 50));
      await fs.writeFile(filePath, 'v2');

      expect(await cache.get(filePath)).toBeUndefined();
    });

    it('returns undefined and invalidates when file size changes', async () => {
      const filePath = await writeFile('a.txt', 'short');
      await cache.set(filePath, 'short');

      await new Promise((r) => setTimeout(r, 50));
      await fs.writeFile(filePath, 'a much longer content string');

      expect(await cache.get(filePath)).toBeUndefined();
    });
  });

  describe('set', () => {
    it('stores content that can be retrieved', async () => {
      const filePath = await writeFile('a.txt', 'content');
      await cache.set(filePath, 'content');
      expect(await cache.get(filePath)).toBe('content');
    });

    it('does not cache content exceeding single file limit', async () => {
      const bigContent = 'x'.repeat(1_100_000); // > 1MB
      const filePath = await writeFile('big.txt', bigContent);
      await cache.set(filePath, bigContent);
      expect(await cache.get(filePath)).toBeUndefined();
    });

    it('evicts LRU entries when total size exceeds limit', async () => {
      const smallCache = new FileContentCache({
        maxFileSizeBytes: 100,
        maxTotalFileSizeBytes: 100,
      });
      const f1 = await writeFile('f1.txt', 'a'.repeat(60));
      const f2 = await writeFile('f2.txt', 'b'.repeat(60));

      await smallCache.set(f1, 'a'.repeat(60));
      await smallCache.set(f2, 'b'.repeat(60));

      expect(await smallCache.get(f1)).toBeUndefined();
      expect(await smallCache.get(f2)).toBe('b'.repeat(60));
    });
  });

  describe('invalidate', () => {
    it('removes a cached entry', async () => {
      const filePath = await writeFile('a.txt', 'content');
      await cache.set(filePath, 'content');
      cache.invalidate(filePath);
      expect(await cache.get(filePath)).toBeUndefined();
    });

    it('is a no-op for unknown paths', () => {
      expect(() => { cache.invalidate('/no/such/path'); }).not.toThrow();
    });
  });

  describe('LRU ordering', () => {
    it('get() refreshes entry, preventing eviction', async () => {
      const smallCache = new FileContentCache({
        maxFileSizeBytes: 150,
        maxTotalFileSizeBytes: 150,
      });
      const f1 = await writeFile('f1.txt', 'a'.repeat(60));
      const f2 = await writeFile('f2.txt', 'b'.repeat(60));
      const f3 = await writeFile('f3.txt', 'c'.repeat(60));

      await smallCache.set(f1, 'a'.repeat(60));
      await smallCache.set(f2, 'b'.repeat(60));

      await smallCache.get(f1);

      await smallCache.set(f3, 'c'.repeat(60));

      expect(await smallCache.get(f1)).toBe('a'.repeat(60));
      expect(await smallCache.get(f2)).toBeUndefined();
      expect(await smallCache.get(f3)).toBe('c'.repeat(60));
    });
  });
});
