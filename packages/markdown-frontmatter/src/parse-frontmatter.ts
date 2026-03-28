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
 * Expects the input to start with `---\n`. Everything between the first
 * and second `---\n` is parsed as YAML. The remainder is returned as `body`.
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

  const endIndex = markdown.indexOf(`\n${DELIMITER}`, DELIMITER.length);
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
    parsed !== null && typeof parsed === 'object' ? parsed : {}
  ) as T;

  return {attributes, body};
}
