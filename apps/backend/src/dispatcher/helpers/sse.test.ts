import assert from 'node:assert';
import {PassThrough} from 'node:stream';

import {describe, expect, it} from 'vitest';

import {writeSseEvent} from './sse.js';

function readAvailableChunks(stream: PassThrough): string[] {
  const chunks: string[] = [];
  for (;;) {
    const chunk: unknown = stream.read();
    if (chunk === null) return chunks;
    assert(chunk instanceof Buffer);
    chunks.push(chunk.toString());
  }
}

describe('writeSseEvent', () => {
  it('writes the backend resume cursor as the SSE id field', () => {
    const stream = new PassThrough();

    writeSseEvent(stream, {type: 'text-delta', content: 'hello'}, 3);

    expect(readAvailableChunks(stream).join('')).toBe(
      'id: 3\ndata: {"type":"text-delta","content":"hello"}\n\n',
    );
  });
});
