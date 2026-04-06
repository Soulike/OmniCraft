import {describe, expect, it} from 'vitest';

import {AsyncChannel} from './async-channel.js';

describe('AsyncChannel', () => {
  describe('buffered values before iteration', () => {
    it('delivers values pushed before the consumer starts iterating', async () => {
      const channel = new AsyncChannel<number>();
      channel.push(1);
      channel.push(2);
      channel.push(3);
      channel.close();

      const results: number[] = [];
      for await (const value of channel) {
        results.push(value);
      }

      expect(results).toEqual([1, 2, 3]);
    });

    it('preserves insertion order of buffered values', async () => {
      const channel = new AsyncChannel<string>();
      channel.push('a');
      channel.push('b');
      channel.push('c');
      channel.push('d');
      channel.close();

      const results: string[] = [];
      for await (const value of channel) {
        results.push(value);
      }

      expect(results).toEqual(['a', 'b', 'c', 'd']);
    });
  });

  describe('immediate delivery when consumer is waiting', () => {
    it('delivers a value immediately when the consumer is already waiting', async () => {
      const channel = new AsyncChannel<number>();

      const resultPromise = (async () => {
        const results: number[] = [];
        for await (const value of channel) {
          results.push(value);
        }
        return results;
      })();

      // Allow the consumer to start waiting.
      await Promise.resolve();

      channel.push(10);
      channel.push(20);
      channel.close();

      const results = await resultPromise;
      expect(results).toEqual([10, 20]);
    });
  });

  describe('close drains buffered values then ends iteration', () => {
    it('delivers all buffered values before ending iteration after close', async () => {
      const channel = new AsyncChannel<number>();

      const resultPromise = (async () => {
        const results: number[] = [];
        for await (const value of channel) {
          results.push(value);
        }
        return results;
      })();

      await Promise.resolve();

      channel.push(1);
      channel.push(2);
      channel.push(3);
      channel.close();

      const results = await resultPromise;
      expect(results).toEqual([1, 2, 3]);
    });

    it('ends iteration after close is called with no pending values', async () => {
      const channel = new AsyncChannel<number>();

      const resultPromise = (async () => {
        const results: number[] = [];
        for await (const value of channel) {
          results.push(value);
        }
        return results;
      })();

      await Promise.resolve();
      channel.close();

      const results = await resultPromise;
      expect(results).toEqual([]);
    });
  });

  describe('push after close is silently ignored', () => {
    it('ignores values pushed after the channel is closed', async () => {
      const channel = new AsyncChannel<number>();
      channel.push(1);
      channel.close();
      channel.push(2);
      channel.push(3);

      const results: number[] = [];
      for await (const value of channel) {
        results.push(value);
      }

      expect(results).toEqual([1]);
    });

    it('does not throw when pushing after close', () => {
      const channel = new AsyncChannel<number>();
      channel.close();

      expect(() => { channel.push(42); }).not.toThrow();
    });
  });

  describe('multiple synchronous pushes', () => {
    it('buffers all synchronously pushed values and delivers them in order', async () => {
      const channel = new AsyncChannel<number>();

      const resultPromise = (async () => {
        const results: number[] = [];
        for await (const value of channel) {
          results.push(value);
        }
        return results;
      })();

      await Promise.resolve();

      for (let i = 0; i < 100; i++) {
        channel.push(i);
      }
      channel.close();

      const results = await resultPromise;
      expect(results).toEqual(Array.from({length: 100}, (_, i) => i));
    });
  });

  describe('empty channel closed immediately', () => {
    it('yields no values when closed without any pushes', async () => {
      const channel = new AsyncChannel<number>();
      channel.close();

      const results: number[] = [];
      for await (const value of channel) {
        results.push(value);
      }

      expect(results).toEqual([]);
    });
  });

  describe('supports any type T', () => {
    it('supports undefined as a value', async () => {
      const channel = new AsyncChannel<undefined>();
      channel.push(undefined);
      channel.push(undefined);
      channel.close();

      const results: undefined[] = [];
      for await (const value of channel) {
        results.push(value);
      }

      expect(results).toEqual([undefined, undefined]);
    });

    it('supports null as a value', async () => {
      const channel = new AsyncChannel<null>();
      channel.push(null);
      channel.push(null);
      channel.close();

      const results: null[] = [];
      for await (const value of channel) {
        results.push(value);
      }

      expect(results).toEqual([null, null]);
    });

    it('supports object values', async () => {
      const obj1 = {id: 1};
      const obj2 = {id: 2};
      const channel = new AsyncChannel<{id: number}>();
      channel.push(obj1);
      channel.push(obj2);
      channel.close();

      const results: {id: number}[] = [];
      for await (const value of channel) {
        results.push(value);
      }

      expect(results).toHaveLength(2);
      expect(results[0]).toBe(obj1);
      expect(results[1]).toBe(obj2);
    });

    it('supports mixed types via union', async () => {
      const channel = new AsyncChannel<string | number | boolean>();
      channel.push('hello');
      channel.push(42);
      channel.push(false);
      channel.close();

      const results: (string | number | boolean)[] = [];
      for await (const value of channel) {
        results.push(value);
      }

      expect(results).toEqual(['hello', 42, false]);
    });
  });

  describe('async iterator protocol', () => {
    it('is an async iterable', () => {
      const channel = new AsyncChannel<number>();
      expect(typeof channel[Symbol.asyncIterator]).toBe('function');
    });

    it('returns an async iterator from Symbol.asyncIterator', () => {
      const channel = new AsyncChannel<number>();
      const iterator = channel[Symbol.asyncIterator]();
      expect(typeof iterator.next).toBe('function');
    });

    it('returns done: true after the channel is closed and drained', async () => {
      const channel = new AsyncChannel<number>();
      channel.push(1);
      channel.close();

      const iterator = channel[Symbol.asyncIterator]();
      const first = await iterator.next();
      expect(first).toEqual({value: 1, done: false});

      const second = await iterator.next();
      expect(second.done).toBe(true);
    });
  });

  describe('interleaved push and consume', () => {
    it('handles alternating pushes and consumes correctly', async () => {
      const channel = new AsyncChannel<number>();
      const results: number[] = [];

      const consumer = (async () => {
        for await (const value of channel) {
          results.push(value);
        }
      })();

      await Promise.resolve();

      channel.push(1);
      // Let the consumer process the value.
      await Promise.resolve();

      channel.push(2);
      await Promise.resolve();

      channel.push(3);
      channel.close();

      await consumer;

      expect(results).toEqual([1, 2, 3]);
    });
  });
});
