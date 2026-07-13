import {parseLatestMarker, resolveReviewRange} from '@omnicraft/ai-review-core';

import {readBotReviewBodies} from './reviews.ts';
import {requireEnv, setOutput} from './shared/gha.ts';
import {createGitHubClient} from './shared/octokit.ts';
import {requirePrNumber, requireSha} from './shared/validate.ts';

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
