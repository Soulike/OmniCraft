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
