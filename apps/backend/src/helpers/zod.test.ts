import {describe, expect, it} from 'vitest';
import {z} from 'zod';

import {
  hasShape,
  isLeafSchemaPath,
  isValidSchemaPath,
  unwrapSchema,
} from './zod.js';

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
    it('stops at array schema without unwrapping to element', () => {
      const inner = z.string();
      const arr = z.array(inner);
      expect(unwrapSchema(arr)).toBe(arr);
    });

    it('unwraps wrappers around array but stops at the array', () => {
      const element = z.number();
      const arr = z.array(element);
      const wrapped = arr.optional();
      // optional -> array (stops here)
      expect(unwrapSchema(wrapped)).toBe(arr);
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

// ---------------------------------------------------------------------------
// isValidSchemaPath
// ---------------------------------------------------------------------------

describe('isValidSchemaPath', () => {
  const inner = z.object({name: z.string().default('x'), count: z.number()});
  const schema = z.object({section: inner.prefault({name: 'x', count: 0})});

  describe('valid paths', () => {
    it('returns true for a top-level key that exists', () => {
      expect(isValidSchemaPath(schema, ['section'])).toBe(true);
    });

    it('returns true for a nested leaf key', () => {
      expect(isValidSchemaPath(schema, ['section', 'name'])).toBe(true);
    });

    it('returns true for another nested leaf key', () => {
      expect(isValidSchemaPath(schema, ['section', 'count'])).toBe(true);
    });
  });

  describe('invalid paths', () => {
    it('returns false for a non-existent top-level key', () => {
      expect(isValidSchemaPath(schema, ['missing'])).toBe(false);
    });

    it('returns false for a non-existent nested key', () => {
      expect(isValidSchemaPath(schema, ['section', 'missing'])).toBe(false);
    });

    it('returns false when path goes deeper than the schema allows', () => {
      expect(isValidSchemaPath(schema, ['section', 'name', 'extra'])).toBe(
        false,
      );
    });

    it('returns false for a deeply over-extended path', () => {
      expect(
        isValidSchemaPath(schema, ['section', 'name', 'a', 'b', 'c']),
      ).toBe(false);
    });

    it('returns false for an empty key path', () => {
      expect(isValidSchemaPath(schema, [])).toBe(false);
    });
  });

  describe('wrapped schemas', () => {
    it('handles a top-level schema wrapped with .default()', () => {
      const s = z.object({
        a: z.object({b: z.string()}).default({b: ''}),
      });
      expect(isValidSchemaPath(s, ['a'])).toBe(true);
      expect(isValidSchemaPath(s, ['a', 'b'])).toBe(true);
      expect(isValidSchemaPath(s, ['a', 'c'])).toBe(false);
    });

    it('handles a top-level schema wrapped with .optional()', () => {
      const s = z.object({
        a: z.object({b: z.number()}).optional(),
      });
      expect(isValidSchemaPath(s, ['a'])).toBe(true);
      expect(isValidSchemaPath(s, ['a', 'b'])).toBe(true);
    });

    it('handles multiple nested wrappers (.optional().default())', () => {
      const s = z.object({
        a: z.object({b: z.boolean()}).optional().default({b: true}),
      });
      expect(isValidSchemaPath(s, ['a', 'b'])).toBe(true);
      expect(isValidSchemaPath(s, ['a', 'z'])).toBe(false);
    });

    it('handles .prefault() on an inner object', () => {
      const s = z.object({
        outer: z.object({inner: z.string()}).prefault({inner: ''}),
      });
      expect(isValidSchemaPath(s, ['outer', 'inner'])).toBe(true);
    });

    it('handles leaf values wrapped with .default()', () => {
      const s = z.object({val: z.string().default('hello')});
      expect(isValidSchemaPath(s, ['val'])).toBe(true);
    });

    it('handles leaf values wrapped with .optional()', () => {
      const s = z.object({val: z.number().optional()});
      expect(isValidSchemaPath(s, ['val'])).toBe(true);
    });
  });

  describe('flat schemas (no nesting)', () => {
    it('works with a flat schema of multiple keys', () => {
      const flat = z.object({
        x: z.string(),
        y: z.number(),
        z: z.boolean(),
      });
      expect(isValidSchemaPath(flat, ['x'])).toBe(true);
      expect(isValidSchemaPath(flat, ['y'])).toBe(true);
      expect(isValidSchemaPath(flat, ['z'])).toBe(true);
      expect(isValidSchemaPath(flat, ['w'])).toBe(false);
    });
  });

  describe('deeply nested schemas', () => {
    it('validates a three-level deep path', () => {
      const s = z.object({
        a: z.object({
          b: z.object({
            c: z.string(),
          }),
        }),
      });
      expect(isValidSchemaPath(s, ['a'])).toBe(true);
      expect(isValidSchemaPath(s, ['a', 'b'])).toBe(true);
      expect(isValidSchemaPath(s, ['a', 'b', 'c'])).toBe(true);
      expect(isValidSchemaPath(s, ['a', 'b', 'c', 'd'])).toBe(false);
    });
  });

  describe('non-object root schema', () => {
    it('returns false for a string root schema', () => {
      expect(isValidSchemaPath(z.string(), ['anything'])).toBe(false);
    });

    it('returns false for a number root schema', () => {
      expect(isValidSchemaPath(z.number(), ['key'])).toBe(false);
    });

    it('returns false for an array root schema', () => {
      expect(isValidSchemaPath(z.array(z.string()), ['0'])).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// isLeafSchemaPath
// ---------------------------------------------------------------------------

describe('isLeafSchemaPath', () => {
  const inner = z.object({name: z.string().default('x'), count: z.number()});
  const schema = z.object({section: inner.prefault({name: 'x', count: 0})});

  describe('leaf paths', () => {
    it('returns true for a path pointing to a string leaf', () => {
      expect(isLeafSchemaPath(schema, ['section', 'name'])).toBe(true);
    });

    it('returns true for a path pointing to a number leaf', () => {
      expect(isLeafSchemaPath(schema, ['section', 'count'])).toBe(true);
    });

    it('returns true for a top-level leaf in a flat schema', () => {
      const flat = z.object({x: z.string()});
      expect(isLeafSchemaPath(flat, ['x'])).toBe(true);
    });

    it('returns true for a boolean leaf', () => {
      const s = z.object({flag: z.boolean()});
      expect(isLeafSchemaPath(s, ['flag'])).toBe(true);
    });
  });

  describe('non-leaf (object) paths', () => {
    it('returns false for a path pointing to a nested object', () => {
      expect(isLeafSchemaPath(schema, ['section'])).toBe(false);
    });

    it('returns false for an intermediate object in a deep schema', () => {
      const s = z.object({
        a: z.object({
          b: z.object({
            c: z.string(),
          }),
        }),
      });
      expect(isLeafSchemaPath(s, ['a'])).toBe(false);
      expect(isLeafSchemaPath(s, ['a', 'b'])).toBe(false);
      expect(isLeafSchemaPath(s, ['a', 'b', 'c'])).toBe(true);
    });
  });

  describe('invalid paths', () => {
    it('returns false for a non-existent key', () => {
      expect(isLeafSchemaPath(schema, ['nonexistent'])).toBe(false);
    });

    it('returns false for a path deeper than the schema', () => {
      expect(isLeafSchemaPath(schema, ['section', 'name', 'extra'])).toBe(
        false,
      );
    });

    it('returns false for an empty key path', () => {
      expect(isLeafSchemaPath(schema, [])).toBe(false);
    });
  });

  describe('wrapped schemas', () => {
    it('recognizes a leaf through .default() wrapping', () => {
      const s = z.object({
        val: z.string().default('hello'),
      });
      expect(isLeafSchemaPath(s, ['val'])).toBe(true);
    });

    it('recognizes a leaf through .optional() wrapping', () => {
      const s = z.object({
        val: z.number().optional(),
      });
      expect(isLeafSchemaPath(s, ['val'])).toBe(true);
    });

    it('recognizes a non-leaf through .default() wrapping on object', () => {
      const s = z.object({
        nested: z.object({x: z.number()}).default({x: 0}),
      });
      expect(isLeafSchemaPath(s, ['nested'])).toBe(false);
      expect(isLeafSchemaPath(s, ['nested', 'x'])).toBe(true);
    });

    it('recognizes a non-leaf through .prefault() wrapping', () => {
      const s = z.object({
        nested: z.object({val: z.string()}).prefault({val: ''}),
      });
      expect(isLeafSchemaPath(s, ['nested'])).toBe(false);
      expect(isLeafSchemaPath(s, ['nested', 'val'])).toBe(true);
    });

    it('recognizes a non-leaf through .optional() wrapping on object', () => {
      const s = z.object({
        nested: z.object({val: z.boolean()}).optional(),
      });
      expect(isLeafSchemaPath(s, ['nested'])).toBe(false);
      expect(isLeafSchemaPath(s, ['nested', 'val'])).toBe(true);
    });

    it('handles deeply wrapped leaf (.optional().default())', () => {
      const s = z.object({
        val: z.string().optional().default('hi'),
      });
      expect(isLeafSchemaPath(s, ['val'])).toBe(true);
    });
  });

  describe('non-object root schema', () => {
    it('returns false for a string root schema', () => {
      expect(isLeafSchemaPath(z.string(), ['anything'])).toBe(false);
    });

    it('returns false for a number root schema', () => {
      expect(isLeafSchemaPath(z.number(), ['key'])).toBe(false);
    });
  });

  describe('various leaf types', () => {
    const s = z.object({
      str: z.string(),
      num: z.number(),
      bool: z.boolean(),
      enumVal: z.enum(['a', 'b', 'c']),
      arr: z.array(z.string()),
    });

    it('returns true for a string field', () => {
      expect(isLeafSchemaPath(s, ['str'])).toBe(true);
    });

    it('returns true for a number field', () => {
      expect(isLeafSchemaPath(s, ['num'])).toBe(true);
    });

    it('returns true for a boolean field', () => {
      expect(isLeafSchemaPath(s, ['bool'])).toBe(true);
    });

    it('returns true for an enum field', () => {
      expect(isLeafSchemaPath(s, ['enumVal'])).toBe(true);
    });

    it('returns true for an array field (arrays have no .shape)', () => {
      expect(isLeafSchemaPath(s, ['arr'])).toBe(true);
    });
  });
});
