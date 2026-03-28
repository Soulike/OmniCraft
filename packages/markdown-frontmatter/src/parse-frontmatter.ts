import {parse as parseYaml} from 'yaml';

/** Result of parsing a Markdown file with YAML frontmatter. */
export interface FrontmatterResult<T> {
  /** Parsed YAML frontmatter as an object. */
  readonly attributes: T;
  /** Markdown body after the frontmatter block. */
  readonly body: string;
}

const DELIMITER = '---';

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
  if (!markdown.startsWith(`${DELIMITER}\n`)) {
    return {attributes: {} as T, body: markdown};
  }

  // Find the closing delimiter: must be `\n---\n` or `\n---` at end of string.
  // Start searching from the position of the opening delimiter's newline,
  // so that `---\n---` (empty frontmatter) is correctly matched.
  const searchFrom = DELIMITER.length;
  let endIndex = -1;
  let pos = searchFrom;

  while (pos < markdown.length) {
    const candidate = markdown.indexOf(`\n${DELIMITER}`, pos);
    if (candidate === -1) break;

    const afterDelimiter = candidate + DELIMITER.length + 1;
    // Closing delimiter must be followed by \n or be at end of string.
    if (
      afterDelimiter >= markdown.length ||
      markdown[afterDelimiter] === '\n'
    ) {
      endIndex = candidate;
      break;
    }
    // Not a valid closing delimiter (e.g., `---foo`), keep searching.
    pos = candidate + 1;
  }

  if (endIndex === -1) {
    return {attributes: {} as T, body: markdown};
  }

  const yamlString = markdown.slice(DELIMITER.length + 1, endIndex);
  const bodyStart = endIndex + DELIMITER.length + 1;
  const body =
    markdown[bodyStart] === '\n'
      ? markdown.slice(bodyStart + 1)
      : markdown.slice(bodyStart);

  const parsed: unknown = parseYaml(yamlString);
  const attributes = (
    parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : {}
  ) as T;

  return {attributes, body};
}
