import {access, mkdtemp, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Readable} from 'node:stream';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {writeCapped} from './write-capped.js';

let scratchDirectory: string;
let destination: string;

beforeEach(async () => {
  scratchDirectory = await mkdtemp(path.join(os.tmpdir(), 'write-capped-'));
  destination = path.join(scratchDirectory, 'out.bin');
});

afterEach(async () => {
  await rm(scratchDirectory, {recursive: true, force: true});
});

function streamOf(buffer: Buffer): Readable {
  return Readable.from([buffer]);
}

describe('writeCapped', () => {
  it('writes the stream to disk and reports its byte size', async () => {
    const bytes = Buffer.from('hello world');
    const result = await writeCapped(streamOf(bytes), destination, 1024);

    expect(result).toEqual({ok: true, byteSize: bytes.length});
    const {readFile} = await import('node:fs/promises');
    await expect(readFile(destination)).resolves.toEqual(bytes);
  });

  it('accepts a stream exactly at the cap', async () => {
    const bytes = Buffer.alloc(1024, 'a');
    const result = await writeCapped(streamOf(bytes), destination, 1024);
    expect(result).toEqual({ok: true, byteSize: 1024});
  });

  it('rejects a stream that exceeds the cap and removes the partial file', async () => {
    const bytes = Buffer.alloc(1025, 'a');
    const result = await writeCapped(streamOf(bytes), destination, 1024);

    expect(result).toEqual({ok: false, reason: 'too-large'});
    await expect(access(destination)).rejects.toThrow();
  });

  it('destroys the source stream instead of draining it once the cap is exceeded', async () => {
    let pulled = 0;
    const TOTAL_CHUNKS = 1000;
    const source = new Readable({
      read() {
        pulled++;
        if (pulled > TOTAL_CHUNKS) {
          this.push(null);
          return;
        }
        this.push(Buffer.alloc(1024, 'a'));
      },
    });

    const result = await writeCapped(source, destination, 2048);

    expect(result).toEqual({ok: false, reason: 'too-large'});
    expect(source.destroyed).toBe(true);
    // The cap is 2 chunks; a bounded pipeline stops long before the source
    // would otherwise have produced all 1000.
    expect(pulled).toBeLessThan(TOTAL_CHUNKS);
    await expect(access(destination)).rejects.toThrow();
  });

  it('rethrows a genuine stream failure (not the cap) and still removes the partial file', async () => {
    const boom = new Error('boom');
    const source = new Readable({
      read() {
        this.destroy(boom);
      },
    });

    await expect(writeCapped(source, destination, 1024)).rejects.toBe(boom);
    await expect(access(destination)).rejects.toThrow();
  });
});
