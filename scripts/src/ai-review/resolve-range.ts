import {writeFileSync} from 'node:fs';

import {
  parseLatestMarker,
  renderKnownIssues,
  resolveReviewRange,
} from '@omnicraft/ai-review-core';

import {fetchUnresolvedBotIssues} from './known-issues.js';
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

  // Render the still-open findings so reviewers can skip already-raised ones,
  // and hand the path to the review job via an output.
  const knownIssues = await fetchUnresolvedBotIssues(client, prNumber);
  const knownIssuesFile = `${requireEnv('RUNNER_TEMP')}/known-issues.md`;
  writeFileSync(knownIssuesFile, renderKnownIssues(knownIssues));

  setOutput('pr_number', String(prNumber));
  setOutput('head_sha', headSha);
  setOutput('has_changes', String(range.hasChanges));
  setOutput('carried_verdict', range.carriedVerdict ?? '');
  setOutput('known_issues_file', knownIssuesFile);

  console.log(
    `PR #${prNumber}: head=${headSha} hasChanges=${range.hasChanges} ` +
      `carried=${range.carriedVerdict ?? '-'} knownIssues=${knownIssues.length}`,
  );
}

await main();
