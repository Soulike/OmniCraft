import {sessionIdSchema} from '@omnicraft/api-schema';

/**
 * Parses and validates the `:id` session path parameter.
 *
 * Session ids are UUIDs ({@link sessionIdSchema}). Validating before the id
 * reaches the store guards against path traversal — `@koa/router` decodes
 * percent-encoded slashes, so an unvalidated id flows into `path.join` and,
 * for deletes, `rm`.
 *
 * @returns the validated id, or `null` if it is not a well-formed session id.
 */
export function parseSessionId(raw: string): string | null {
  const result = sessionIdSchema.safeParse(raw);
  return result.success ? result.data : null;
}
