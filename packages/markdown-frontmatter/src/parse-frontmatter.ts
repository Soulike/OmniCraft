import {parse as parseYaml} from 'yaml';

/** Result of parsing a Markdown file with YAML frontmatter. */
export interface FrontmatterResult<T> {
  /** Parsed YAML frontmatter as an object. */
  readonly attributes: T;
  /** Markdown body after the frontmatter block. */
  readonly body: string;
}

/**
 * Matches YAML frontmatter at the start of a Markdown string.
 *
 * Expected format:
 * ```
 * ---
 * <yaml content>
 * ---
 * <body>
 * ```
 *
 * - `^---\n`           — opening delimiter on the first line
 * - `(?:([\s\S]*?)\n)` — YAML content with trailing newline (optional for empty frontmatter)
 * - `?---`             — closing delimiter on its own line
 * - `(?:\n|$)`         — followed by a newline or end of string
 */
const FRONTMATTER_REGEX = /^---\n(?:([\s\S]*?)\n)?---(?:\n|$)/;

/**
 * Parses a Markdown string with YAML frontmatter.
 *
 * Expects the input to start with `---\n`. The closing `---` must appear
 * on its own line (followed by `\n` or end of string). Everything between
 * the delimiters is parsed as YAML. The remainder is returned as `body`.
 *
 * If no valid frontmatter block is found, `attributes` is an empty object
 * and `body` is the entire input.
 */
export function parseFrontmatter<T = Record<string, unknown>>(
  markdown: string,
): FrontmatterResult<T> {
  const match = FRONTMATTER_REGEX.exec(markdown);
  if (!match) {
    return {attributes: {} as T, body: markdown};
  }

  const yamlString = (match[1] as string | undefined) ?? '';
  const body = markdown.slice(match[0].length);

  const parsed: unknown = parseYaml(yamlString);
  const attributes = (
    parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : {}
  ) as T;

  return {attributes, body};
}
