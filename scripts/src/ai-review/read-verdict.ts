import {parseLatestMarker} from '@omnicraft/ai-review-core';

import {readBotReviewBodies} from './reviews.js';
import {requireEnv, setOutput} from './shared/gha.js';
import {createGitHubClient} from './shared/octokit.js';
import {requirePrNumber} from './shared/validate.js';

async function main(): Promise<void> {
  const prNumber = Number(requirePrNumber(requireEnv('PR_NUMBER')));
  const client = createGitHubClient();

  const marker = parseLatestMarker(await readBotReviewBodies(client, prNumber));

  // Empty output is read by gate.ts as "unreadable" → fail safe.
  setOutput('verdict', marker?.verdict ?? '');
  console.log(`Read verdict: ${marker?.verdict ?? '(none)'}`);
}

await main();
