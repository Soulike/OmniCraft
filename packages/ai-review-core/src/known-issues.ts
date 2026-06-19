/** A previously-raised, still-unresolved review finding. */
export interface KnownIssue {
  /** File path the finding was anchored to. */
  readonly path: string;
  /** Line number, or `null` for a file-level / summary finding. */
  readonly line: number | null;
  /** The finding's comment body (may be multi-line). */
  readonly body: string;
}

/** First non-empty, trimmed line of a body, or `''` if there is none. */
function firstLine(body: string): string {
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return '';
}

/**
 * Renders known issues as a compact Markdown list (`- path:line — summary`),
 * one per line, using only the first line of each body to stay token-cheap.
 * Returns the literal `(none)` when the list is empty so the prompt can state
 * that explicitly.
 */
export function renderKnownIssues(issues: readonly KnownIssue[]): string {
  if (issues.length === 0) {
    return '(none)';
  }
  return issues
    .map((issue) => {
      const where = issue.line === null ? '(no line)' : String(issue.line);
      return `- ${issue.path}:${where} — ${firstLine(issue.body)}`;
    })
    .join('\n');
}
