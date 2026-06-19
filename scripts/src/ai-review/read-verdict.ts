import {parseLatestMarker} from '@omnicraft/ai-review-core';

import {requireEnv, setOutput} from './gha.js';
import {createGitHubClient} from './octokit.js';
import {readBotReviewBodies} from './reviews.js';
import {requirePrNumber} from './validate.js';

async function main(): Promise<void> {
  const prNumber = Number(requirePrNumber(requireEnv('PR_NUMBER')));
  const client = createGitHubClient();

  const marker = parseLatestMarker(await readBotReviewBodies(client, prNumber));

  // Empty output is read by gate.ts as "unreadable" → fail safe.
  setOutput('verdict', marker?.verdict ?? '');
  console.log(`Read verdict: ${marker?.verdict ?? '(none)'}`);
}

await main();
