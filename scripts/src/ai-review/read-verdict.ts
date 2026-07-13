import {parseLatestMarker} from '@omnicraft/ai-review-core';

import {readBotReviewBodies} from './reviews.ts';
import {requireEnv, setOutput} from './shared/gha.ts';
import {createGitHubClient} from './shared/octokit.ts';
import {requirePrNumber, requireSha} from './shared/validate.ts';

async function main(): Promise<void> {
  const prNumber = Number(requirePrNumber(requireEnv('PR_NUMBER')));
  const headSha = requireSha('HEAD_SHA', requireEnv('HEAD_SHA'));
  const client = createGitHubClient();

  const marker = parseLatestMarker(await readBotReviewBodies(client, prNumber));

  // Only trust the verdict when the newest bot review carries a marker for the
  // *current* head. A marker from an older head (e.g. confirm exited 0 but
  // posted no valid marker this round) must not pass — emit `''` so gate.ts
  // reads it as "unreadable" and fails closed.
  const verdict = marker?.reviewedHead === headSha ? marker.verdict : '';
  setOutput('verdict', verdict);
  console.log(
    `Read verdict: ${verdict === '' ? '(none for current head)' : verdict}`,
  );
}

await main();
