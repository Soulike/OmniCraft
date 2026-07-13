import {Octokit} from '@octokit/rest';

import {requireEnv} from './gha.ts';
import {requireRepo} from './validate.ts';

/** An authenticated Octokit client plus the parsed `owner`/`repo` it targets. */
export interface GitHubClient {
  readonly octokit: Octokit;
  readonly owner: string;
  readonly repo: string;
}

/**
 * Builds an Octokit client from the `GH_TOKEN` and `GH_REPO` environment
 * variables (the standard GitHub Actions token and `owner/name` slug). `GH_REPO`
 * is validated before being split.
 */
export function createGitHubClient(): GitHubClient {
  const token = requireEnv('GH_TOKEN');
  const [owner, repo] = requireRepo(requireEnv('GH_REPO')).split('/');
  return {
    octokit: new Octokit({auth: token}),
    owner,
    repo,
  };
}
