import assert from 'node:assert';

import type {ZodType} from 'zod';

/** A Zod schema that has a `.shape` property (i.e., an object schema). */
interface ZodObjectLike {
  shape: Record<string, ZodType>;
}

/** Checks whether a Zod schema is an object schema with a `.shape` property. */
export function hasShape(schema: ZodType): schema is ZodType & ZodObjectLike {
  return 'shape' in schema && typeof schema.shape === 'object';
}

/** Unwraps Zod wrapper types (default, prefault, optional, etc.) to get the core schema. */
export function unwrapSchema(schema: ZodType): ZodType {
  let s = schema;
  while ('unwrap' in s && typeof s.unwrap === 'function') {
    s = (s as ZodType & {unwrap(): ZodType}).unwrap();
  }
  return s;
}

/**
 * Checks whether the given key path exists in the schema tree.
 * @param schema - Root Zod schema to validate against.
 * @param keyPath - Path segments to check (must be non-empty).
 */
export function isValidSchemaPath(schema: ZodType, keyPath: string[]): boolean {
  if (keyPath.length === 0) {
    return false;
  }

  let current: ZodType = schema;
  for (const key of keyPath) {
    const unwrapped = unwrapSchema(current);
    if (!hasShape(unwrapped)) {
      return false;
    }
    if (!(key in unwrapped.shape)) {
      return false;
    }
    current = unwrapped.shape[key];
  }
  return true;
}

/**
 * Checks whether the given key path points to a leaf (scalar) node in the schema.
 * @param schema - Root Zod schema to validate against.
 * @param keyPath - Path segments to check (must be non-empty).
 */
export function isLeafSchemaPath(schema: ZodType, keyPath: string[]): boolean {
  if (!isValidSchemaPath(schema, keyPath)) {
    return false;
  }

  let current: ZodType = schema;
  for (const key of keyPath) {
    const unwrapped = unwrapSchema(current);
    assert(hasShape(unwrapped));
    current = unwrapped.shape[key];
  }

  return !hasShape(unwrapSchema(current));
}
