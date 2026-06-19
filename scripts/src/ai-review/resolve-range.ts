import {parseLatestMarker, resolveReviewRange} from '@omnicraft/ai-review-core';

import {readBotReviewBodies} from './reviews.js';
import {requireEnv, setOutput} from './shared/gha.js';
import {createGitHubClient} from './shared/octokit.js';
import {requirePrNumber, requireSha} from './shared/validate.js';

async function main(): Promise<void> {
  const client = createGitHubClient();
  const prNumber = Number(requirePrNumber(requireEnv('PR_NUMBER')));
  const headSha = requireSha('PR_HEAD_SHA', requireEnv('PR_HEAD_SHA'));

  const previousMarker = parseLatestMarker(
    await readBotReviewBodies(client, prNumber),
  );
  const range = resolveReviewRange({headSha, previousMarker});

  setOutput('pr_number', String(prNumber));
  setOutput('head_sha', headSha);
  setOutput('has_changes', String(range.hasChanges));
  setOutput('carried_verdict', range.carriedVerdict ?? '');

  console.log(
    `PR #${prNumber}: head=${headSha} hasChanges=${range.hasChanges} ` +
      `carried=${range.carriedVerdict ?? '-'}`,
  );
}

await main();
