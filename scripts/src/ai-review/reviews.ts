import {run} from './git.js';

/**
 * Login of the identity that posts AI-review reviews. In GitHub Actions the
 * built-in `GITHUB_TOKEN` authors reviews as `github-actions[bot]`. Only
 * reviews from this author are trusted to carry the verdict marker — otherwise
 * a PR participant could forge an `approved` marker in their own review body and
 * bypass the gate.
 */
const REVIEW_AUTHOR = 'github-actions[bot]';

interface GhReview {
  readonly body?: string;
  readonly user?: {readonly login?: string};
}

/**
 * Returns the bodies of PR reviews authored by the gate bot, oldest first.
 * Reviews from any other author are ignored so the verdict marker cannot be
 * forged by a PR participant.
 *
 * Uses `--paginate --slurp` (not `--paginate` alone): with multiple pages,
 * plain `--paginate` concatenates separate JSON arrays into one non-parseable
 * stream, whereas `--slurp` wraps each page as an element of an outer array,
 * which we flatten back into the review list.
 */
export function readBotReviewBodies(repo: string, prNumber: string): string[] {
  const json = run('gh', [
    'api',
    `repos/${repo}/pulls/${prNumber}/reviews`,
    '--paginate',
    '--slurp',
  ]);
  const pages = JSON.parse(json) as GhReview[][];
  return pages
    .flat()
    .filter((review) => review.user?.login === REVIEW_AUTHOR)
    .map((review) => review.body ?? '');
}
