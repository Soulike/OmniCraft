import {describe, expect, it} from 'vitest';

import {getParent} from './object.js';

describe('getParent', () => {
  describe('single-element path', () => {
    it('returns the root object itself', () => {
      const obj = {a: 1, b: 2};
      expect(getParent(obj, ['a'])).toBe(obj);
    });

    it('returns the root even when the key does not exist in root', () => {
      const obj = {a: 1};
      // The parent of a single-element path is always the root object,
      // regardless of whether the key exists.
      expect(getParent(obj, ['missing'])).toBe(obj);
    });

    it('returns the root for an empty object', () => {
      const obj = {};
      expect(getParent(obj, ['key'])).toBe(obj);
    });
  });

  describe('multi-level paths', () => {
    it('returns the immediate parent for a two-level path', () => {
      const child = {c: 3};
      const obj = {a: child};
      expect(getParent(obj, ['a', 'c'])).toBe(child);
    });

    it('returns the correct parent for a three-level path', () => {
      const grandchild = {d: 4};
      const child = {c: grandchild};
      const obj = {a: {b: child}};
      expect(getParent(obj, ['a', 'b', 'c'])).toBe(child);
    });

    it('returns the deepest parent in a deeply nested path', () => {
      const leaf = {value: 'end'};
      const obj = {a: {b: {c: {d: leaf}}}};
      expect(getParent(obj, ['a', 'b', 'c', 'd', 'value'])).toBe(leaf);
    });
  });

  describe('intermediate key is null', () => {
    it('throws when an intermediate key points to null', () => {
      const obj = {a: null} as unknown as Record<string, unknown>;
      expect(() => getParent(obj, ['a', 'b'])).toThrow();
    });

    it('throws when a deeply nested intermediate is null', () => {
      const obj = {a: {b: null}} as unknown as Record<string, unknown>;
      expect(() => getParent(obj, ['a', 'b', 'c'])).toThrow();
    });
  });

  describe('intermediate key is not an object', () => {
    it('throws when an intermediate key is a number', () => {
      const obj = {a: 42} as unknown as Record<string, unknown>;
      expect(() => getParent(obj, ['a', 'b'])).toThrow();
    });

    it('throws when an intermediate key is a string', () => {
      const obj = {a: 'hello'} as unknown as Record<string, unknown>;
      expect(() => getParent(obj, ['a', 'b'])).toThrow();
    });

    it('throws when an intermediate key is a boolean', () => {
      const obj = {a: true} as unknown as Record<string, unknown>;
      expect(() => getParent(obj, ['a', 'b'])).toThrow();
    });

    it('throws when an intermediate key is undefined', () => {
      const obj = {a: undefined} as unknown as Record<string, unknown>;
      expect(() => getParent(obj, ['a', 'b'])).toThrow();
    });
  });

  describe('intermediate key is missing', () => {
    it('throws when the first key does not exist', () => {
      const obj = {x: 1};
      expect(() => getParent(obj, ['missing', 'child'])).toThrow();
    });

    it('throws when a middle key does not exist', () => {
      const obj = {a: {b: {c: 1}}};
      expect(() => getParent(obj, ['a', 'missing', 'child'])).toThrow();
    });
  });

  describe('edge cases with object-like intermediates', () => {
    it('traverses through an array (arrays are objects)', () => {
      // Arrays are technically objects, so navigating into them shouldn't
      // throw on the "is object" assertion. Behavior may vary, but the
      // assertion check is `typeof x === 'object' && x !== null`.
      const arr = [10, 20, 30];
      const obj = {a: arr} as unknown as Record<string, unknown>;
      // Parent of ['a', '0'] is the array itself
      expect(getParent(obj, ['a', '0'])).toBe(arr);
    });

    it('returns the root when the path has exactly one element', () => {
      const obj = {nested: {deep: 1}};
      expect(getParent(obj, ['nested'])).toBe(obj);
    });
  });

  describe('identity and reference checks', () => {
    it('returns the exact same reference as the parent object', () => {
      const parent = {child: 'value'};
      const obj = {level1: parent};
      const result = getParent(obj, ['level1', 'child']);
      expect(result).toBe(parent);
    });

    it('works when multiple keys exist at the same level', () => {
      const target = {x: 1, y: 2, z: 3};
      const obj = {a: target};
      expect(getParent(obj, ['a', 'x'])).toBe(target);
      expect(getParent(obj, ['a', 'y'])).toBe(target);
      expect(getParent(obj, ['a', 'z'])).toBe(target);
    });
  });
});
