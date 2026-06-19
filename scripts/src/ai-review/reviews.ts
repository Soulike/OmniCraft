import type {GitHubClient} from './octokit.js';

/**
 * Login of the identity that posts AI-review reviews. In GitHub Actions the
 * built-in `GITHUB_TOKEN` authors reviews as `github-actions[bot]`. Only
 * reviews from this author are trusted to carry the verdict marker — otherwise
 * a PR participant could forge an `approved` marker in their own review body and
 * bypass the gate.
 */
const REVIEW_AUTHOR = 'github-actions[bot]';

/**
 * Returns the bodies of PR reviews authored by the gate bot, oldest first.
 * Reviews from any other author are ignored so the verdict marker cannot be
 * forged by a PR participant. Pagination is handled by `octokit.paginate`.
 */
export async function readBotReviewBodies(
  client: GitHubClient,
  prNumber: number,
): Promise<string[]> {
  const {octokit, owner, repo} = client;
  const reviews = await octokit.paginate(octokit.rest.pulls.listReviews, {
    owner,
    repo,
    pull_number: prNumber,
    per_page: 100,
  });
  return reviews
    .filter((review) => review.user?.login === REVIEW_AUTHOR)
    .map((review) => review.body);
}
