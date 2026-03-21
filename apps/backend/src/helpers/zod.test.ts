import {describe, expect, it} from 'vitest';
import {z} from 'zod';

import {hasShape, unwrapSchema} from './zod.js';

describe('hasShape', () => {
  it('returns true for a plain object schema', () => {
    const schema = z.object({name: z.string()});
    expect(hasShape(schema)).toBe(true);
  });

  it('returns true for an empty object schema', () => {
    const schema = z.object({});
    expect(hasShape(schema)).toBe(true);
  });

  it('returns false for a string schema', () => {
    expect(hasShape(z.string())).toBe(false);
  });

  it('returns false for a number schema', () => {
    expect(hasShape(z.number())).toBe(false);
  });

  it('returns false for a boolean schema', () => {
    expect(hasShape(z.boolean())).toBe(false);
  });

  it('returns false for an array schema', () => {
    expect(hasShape(z.array(z.string()))).toBe(false);
  });

  it('returns false for an enum schema', () => {
    expect(hasShape(z.enum(['a', 'b', 'c']))).toBe(false);
  });

  it('returns false for a tuple schema', () => {
    expect(hasShape(z.tuple([z.string(), z.number()]))).toBe(false);
  });

  it('returns false for a union schema', () => {
    expect(hasShape(z.union([z.string(), z.number()]))).toBe(false);
  });

  it('returns false for an object wrapped with .default()', () => {
    const schema = z.object({x: z.number()}).default({x: 0});
    expect(hasShape(schema)).toBe(false);
  });

  it('returns false for an object wrapped with .optional()', () => {
    const schema = z.object({x: z.number()}).optional();
    expect(hasShape(schema)).toBe(false);
  });

  it('returns false for an object wrapped with .nullable()', () => {
    const schema = z.object({x: z.number()}).nullable();
    expect(hasShape(schema)).toBe(false);
  });

  it('returns false for an object wrapped with .prefault()', () => {
    const schema = z.object({x: z.number()}).prefault({x: 0});
    expect(hasShape(schema)).toBe(false);
  });

  it('returns false for an object wrapped with .readonly()', () => {
    const schema = z.object({x: z.number()}).readonly();
    expect(hasShape(schema)).toBe(false);
  });
});

describe('unwrapSchema', () => {
  describe('schemas without wrappers', () => {
    it('returns a string schema unchanged', () => {
      const schema = z.string();
      expect(unwrapSchema(schema)).toBe(schema);
    });

    it('returns a number schema unchanged', () => {
      const schema = z.number();
      expect(unwrapSchema(schema)).toBe(schema);
    });

    it('returns a boolean schema unchanged', () => {
      const schema = z.boolean();
      expect(unwrapSchema(schema)).toBe(schema);
    });

    it('returns an enum schema unchanged', () => {
      const schema = z.enum(['x', 'y']);
      expect(unwrapSchema(schema)).toBe(schema);
    });

    it('returns a plain object schema unchanged', () => {
      const schema = z.object({a: z.string()});
      expect(unwrapSchema(schema)).toBe(schema);
    });

    it('returns a tuple schema unchanged', () => {
      const schema = z.tuple([z.string()]);
      expect(unwrapSchema(schema)).toBe(schema);
    });

    it('returns a union schema unchanged', () => {
      const schema = z.union([z.string(), z.number()]);
      expect(unwrapSchema(schema)).toBe(schema);
    });

    it('returns an intersection schema unchanged', () => {
      const schema = z.intersection(
        z.object({a: z.string()}),
        z.object({b: z.number()}),
      );
      expect(unwrapSchema(schema)).toBe(schema);
    });

    it('returns a record schema unchanged', () => {
      const schema = z.record(z.string(), z.string());
      expect(unwrapSchema(schema)).toBe(schema);
    });
  });

  describe('single wrapper', () => {
    it('unwraps .default()', () => {
      const inner = z.string();
      const wrapped = inner.default('hello');
      expect(unwrapSchema(wrapped)).toBe(inner);
    });

    it('unwraps .optional()', () => {
      const inner = z.number();
      const wrapped = inner.optional();
      expect(unwrapSchema(wrapped)).toBe(inner);
    });

    it('unwraps .nullable()', () => {
      const inner = z.boolean();
      const wrapped = inner.nullable();
      expect(unwrapSchema(wrapped)).toBe(inner);
    });

    it('unwraps .prefault()', () => {
      const inner = z.string();
      const wrapped = inner.prefault('fallback');
      expect(unwrapSchema(wrapped)).toBe(inner);
    });

    it('unwraps .readonly()', () => {
      const inner = z.object({x: z.number()});
      const wrapped = inner.readonly();
      expect(unwrapSchema(wrapped)).toBe(inner);
    });
  });

  describe('nested wrappers', () => {
    it('unwraps .optional().default()', () => {
      const inner = z.object({a: z.string()});
      const wrapped = inner.optional().default({a: 'test'});
      expect(unwrapSchema(wrapped)).toBe(inner);
    });

    it('unwraps .default().optional()', () => {
      const inner = z.object({x: z.number()});
      const wrapped = inner.default({x: 1}).optional();
      expect(unwrapSchema(wrapped)).toBe(inner);
    });

    it('unwraps .nullable().optional()', () => {
      const inner = z.string();
      const wrapped = inner.nullable().optional();
      expect(unwrapSchema(wrapped)).toBe(inner);
    });

    it('unwraps three levels: .nullable().optional().default()', () => {
      const inner = z.number();
      const wrapped = inner.nullable().optional().default(null);
      expect(unwrapSchema(wrapped)).toBe(inner);
    });

    it('unwraps .readonly().optional().default()', () => {
      const inner = z.object({key: z.string()});
      const wrapped = inner.readonly().optional().default({key: ''});
      expect(unwrapSchema(wrapped)).toBe(inner);
    });
  });

  describe('unwrapped result has correct shape', () => {
    it('unwrapped object schema has shape', () => {
      const inner = z.object({name: z.string(), age: z.number()});
      const wrapped = inner.default({name: '', age: 0}).optional();
      const result = unwrapSchema(wrapped);
      expect(hasShape(result)).toBe(true);
    });

    it('unwrapped non-object schema does not have shape', () => {
      const inner = z.string();
      const wrapped = inner.optional().default('hi');
      const result = unwrapSchema(wrapped);
      expect(hasShape(result)).toBe(false);
    });
  });

  describe('array schema unwrap behavior', () => {
    it('fully unwraps through array .unwrap() to the element schema', () => {
      const inner = z.string();
      const arr = z.array(inner);
      // z.array has .unwrap() that returns the element type, so unwrapSchema
      // traverses through it — this is the implementation's behavior
      expect(unwrapSchema(arr)).toBe(inner);
    });

    it('unwraps a wrapped array to its element schema', () => {
      const element = z.number();
      const wrapped = z.array(element).optional();
      // optional -> array -> element
      expect(unwrapSchema(wrapped)).toBe(element);
    });
  });

  describe('lazy and promise schema unwrap behavior', () => {
    it('unwraps a lazy schema', () => {
      const inner = z.string();
      const lazy = z.lazy(() => inner);
      expect(unwrapSchema(lazy)).toBe(inner);
    });

    it('unwraps a promise schema', () => {
      const inner = z.number();
      const promise = z.promise(inner);
      expect(unwrapSchema(promise)).toBe(inner);
    });
  });
});
