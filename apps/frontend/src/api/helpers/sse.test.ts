import {describe, expect, it} from 'vitest';

import {parseSseStream} from './sse.js';

function createMockResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  let index = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]));
        index++;
      } else {
        controller.close();
      }
    },
  });
  return new Response(stream);
}

function createNullBodyResponse(): Response {
  return {body: null} as unknown as Response;
}

async function collectResults(response: Response): Promise<string[]> {
  const results: string[] = [];
  for await (const data of parseSseStream(response)) {
    results.push(data);
  }
  return results;
}

describe('parseSseStream', () => {
  describe('null body', () => {
    it('should throw when response body is null', async () => {
      const response = createNullBodyResponse();
      await expect(collectResults(response)).rejects.toThrow();
    });
  });

  describe('single event', () => {
    it('should yield data from a single SSE event', async () => {
      const response = createMockResponse(['data: hello\n\n']);
      const results = await collectResults(response);
      expect(results).toEqual(['hello']);
    });
  });

  describe('multiple events in one chunk', () => {
    it('should yield data from multiple SSE events', async () => {
      const response = createMockResponse([
        'data: first\n\ndata: second\n\ndata: third\n\n',
      ]);
      const results = await collectResults(response);
      expect(results).toEqual(['first', 'second', 'third']);
    });
  });

  describe('multiple events across multiple chunks', () => {
    it('should yield data from events in separate chunks', async () => {
      const response = createMockResponse([
        'data: first\n\n',
        'data: second\n\n',
      ]);
      const results = await collectResults(response);
      expect(results).toEqual(['first', 'second']);
    });
  });

  describe('buffering across chunk boundaries', () => {
    it('should handle an event split across two chunks', async () => {
      const response = createMockResponse(['data: hel', 'lo\n\n']);
      const results = await collectResults(response);
      expect(results).toEqual(['hello']);
    });

    it('should handle double newline split across chunks', async () => {
      const response = createMockResponse(['data: hello\n', '\n']);
      const results = await collectResults(response);
      expect(results).toEqual(['hello']);
    });

    it('should handle multiple events split at arbitrary positions', async () => {
      const response = createMockResponse([
        'data: fi',
        'rst\n\nda',
        'ta: second\n',
        '\n',
      ]);
      const results = await collectResults(response);
      expect(results).toEqual(['first', 'second']);
    });

    it('should handle data prefix split across chunks', async () => {
      const response = createMockResponse(['da', 'ta: value\n\n']);
      const results = await collectResults(response);
      expect(results).toEqual(['value']);
    });
  });

  describe('empty lines', () => {
    it('should skip empty lines between events', async () => {
      const response = createMockResponse([
        'data: first\n\n\n\ndata: second\n\n',
      ]);
      const results = await collectResults(response);
      expect(results).toEqual(['first', 'second']);
    });
  });

  describe('non-data lines', () => {
    it('should skip event blocks without data: prefix', async () => {
      const response = createMockResponse([
        'event: message\n\ndata: hello\n\n',
      ]);
      const results = await collectResults(response);
      expect(results).toEqual(['hello']);
    });

    it('should handle multi-field events with event and data', async () => {
      const response = createMockResponse(['event: message\ndata: hello\n\n']);
      const results = await collectResults(response);
      expect(results).toEqual(['hello']);
    });

    it('should skip comment blocks', async () => {
      const response = createMockResponse([
        ': this is a comment\n\ndata: hello\n\n',
      ]);
      const results = await collectResults(response);
      expect(results).toEqual(['hello']);
    });

    it('should skip id blocks', async () => {
      const response = createMockResponse(['id: 123\n\ndata: hello\n\n']);
      const results = await collectResults(response);
      expect(results).toEqual(['hello']);
    });

    it('should only yield data-prefixed blocks among mixed blocks', async () => {
      const response = createMockResponse([
        'retry: 3000\n\ndata: first\n\nevent: update\n\ndata: second\n\n',
      ]);
      const results = await collectResults(response);
      expect(results).toEqual(['first', 'second']);
    });
  });

  describe('empty stream', () => {
    it('should yield nothing for an empty stream', async () => {
      const response = createMockResponse([]);
      const results = await collectResults(response);
      expect(results).toEqual([]);
    });

    it('should yield nothing when stream contains only whitespace', async () => {
      const response = createMockResponse(['\n\n\n']);
      const results = await collectResults(response);
      expect(results).toEqual([]);
    });
  });

  describe('data with special content', () => {
    it('should yield JSON string content as-is', async () => {
      const json = '{"key":"value","num":42}';
      const response = createMockResponse([`data: ${json}\n\n`]);
      const results = await collectResults(response);
      expect(results).toEqual([json]);
    });

    it('should preserve spaces in data content', async () => {
      const response = createMockResponse(['data: hello world\n\n']);
      const results = await collectResults(response);
      expect(results).toEqual(['hello world']);
    });

    it('should handle data with colons in value', async () => {
      const response = createMockResponse(['data: key: value\n\n']);
      const results = await collectResults(response);
      expect(results).toEqual(['key: value']);
    });

    it('should handle data: without trailing space', async () => {
      const response = createMockResponse(['data:hello\n\n']);
      const results = await collectResults(response);
      expect(results).toEqual(['hello']);
    });

    it('should combine multiple data lines in a single event block', async () => {
      const response = createMockResponse(['data: a\ndata: b\n\n']);
      const results = await collectResults(response);
      expect(results).toEqual(['a\nb']);
    });
  });

  describe('stream with no trailing double newline', () => {
    it('should handle event without trailing separator at end of stream', async () => {
      const response = createMockResponse(['data: first\n\ndata: last']);
      const results = await collectResults(response);
      // The last event may or may not be yielded depending on implementation.
      // At minimum, the first complete event should be yielded.
      expect(results[0]).toBe('first');
    });
  });

  describe('malformed stream', () => {
    it('should throw on a line with no recognized SSE prefix', async () => {
      const response = createMockResponse(['garbage data\n\n']);
      await expect(collectResults(response)).rejects.toThrow();
    });

    it('should throw on a line that looks like a field but is not valid', async () => {
      const response = createMockResponse(['foo: bar\n\n']);
      await expect(collectResults(response)).rejects.toThrow();
    });

    it('should throw even when malformed event follows valid events', async () => {
      const response = createMockResponse(['data: hello\n\nbad line\n\n']);
      await expect(collectResults(response)).rejects.toThrow();
    });

    it('should throw when a later line in a multi-line block is malformed', async () => {
      const response = createMockResponse(['data: ok\nbad line\n\n']);
      await expect(collectResults(response)).rejects.toThrow();
    });
  });

  describe('many small chunks', () => {
    it('should correctly reassemble data from character-by-character chunks', async () => {
      const fullMessage = 'data: hello\n\n';
      const chunks = fullMessage.split('');
      const response = createMockResponse(chunks);
      const results = await collectResults(response);
      expect(results).toEqual(['hello']);
    });
  });

  describe('large messages', () => {
    it('should handle a large payload in a single event', async () => {
      const largePayload = 'x'.repeat(100_000);
      const response = createMockResponse([`data: ${largePayload}\n\n`]);
      const results = await collectResults(response);
      expect(results).toEqual([largePayload]);
    });

    it('should handle many events in a stream', async () => {
      const eventCount = 1_000;
      const stream = Array.from(
        {length: eventCount},
        (_, i) => `data: event-${i}\n\n`,
      ).join('');
      const response = createMockResponse([stream]);
      const results = await collectResults(response);
      expect(results).toHaveLength(eventCount);
      expect(results[0]).toBe('event-0');
      expect(results[999]).toBe('event-999');
    });

    it('should handle a large payload split across many chunks', async () => {
      const largePayload = 'y'.repeat(100_000);
      const fullMessage = `data: ${largePayload}\n\n`;
      const chunkSize = 1_024;
      const chunks: string[] = [];
      for (let i = 0; i < fullMessage.length; i += chunkSize) {
        chunks.push(fullMessage.slice(i, i + chunkSize));
      }
      const response = createMockResponse(chunks);
      const results = await collectResults(response);
      expect(results).toEqual([largePayload]);
    });
  });
});
