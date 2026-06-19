import type {KnownIssue} from '@omnicraft/ai-review-core';

import type {GitHubClient} from './shared/octokit.js';

/** Login whose review threads count as already-raised gate findings. */
const REVIEW_AUTHOR = 'github-actions[bot]';

interface ThreadComment {
  readonly author: {readonly login: string} | null;
  readonly path: string;
  readonly line: number | null;
  readonly body: string;
}

interface ReviewThread {
  readonly isResolved: boolean;
  readonly comments: {readonly nodes: readonly ThreadComment[]};
}

interface ThreadsPage {
  readonly repository: {
    readonly pullRequest: {
      readonly reviewThreads: {
        readonly pageInfo: {
          readonly hasNextPage: boolean;
          readonly endCursor: string | null;
        };
        readonly nodes: readonly ReviewThread[];
      };
    };
  };
}

const THREADS_QUERY = `
  query ($owner: String!, $repo: String!, $num: Int!, $cursor: String) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $num) {
        reviewThreads(first: 100, after: $cursor) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            isResolved
            comments(first: 1) {
              nodes {
                author {
                  login
                }
                path
                line
                body
              }
            }
          }
        }
      }
    }
  }
`;

/**
 * Returns the still-unresolved review findings previously raised by the gate
 * bot on this PR, as {@link KnownIssue}[]. Resolved threads and threads authored
 * by anyone else are excluded. Paginates through all review threads.
 */
export async function fetchUnresolvedBotIssues(
  client: GitHubClient,
  prNumber: number,
): Promise<KnownIssue[]> {
  const {octokit, owner, repo} = client;
  const issues: KnownIssue[] = [];
  let cursor: string | null = null;

  for (;;) {
    const page: ThreadsPage = await octokit.graphql(THREADS_QUERY, {
      owner,
      repo,
      num: prNumber,
      cursor,
    });
    const {pageInfo, nodes} = page.repository.pullRequest.reviewThreads;

    for (const thread of nodes) {
      if (thread.isResolved) {
        continue;
      }
      // `.at(0)` is typed `ThreadComment | undefined`, so the guard is real even
      // with `noUncheckedIndexedAccess` off: a thread row can outlive its only
      // comment (deleted), leaving `nodes` empty.
      const comment = thread.comments.nodes.at(0);
      if (comment === undefined || comment.author?.login !== REVIEW_AUTHOR) {
        continue;
      }
      issues.push({path: comment.path, line: comment.line, body: comment.body});
    }

    if (!pageInfo.hasNextPage) {
      return issues;
    }
    cursor = pageInfo.endCursor;
  }
}
