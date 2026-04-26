import assert from 'node:assert';
import {PassThrough} from 'node:stream';

import {describe, expect, it} from 'vitest';

import {writeSseEvent} from './sse.js';

describe('writeSseEvent', () => {
  it('writes the backend resume cursor as the SSE id field', () => {
    const stream = new PassThrough();

    writeSseEvent(stream, {type: 'text-delta', content: 'hello'}, 3);

    const chunk: unknown = stream.read();
    assert(chunk instanceof Buffer);
    expect(chunk.toString()).toBe(
      'id: 3\ndata: {"type":"text-delta","content":"hello"}\n\n',
    );
  });
});
