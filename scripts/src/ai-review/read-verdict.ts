import {parseLatestMarker} from '@omnicraft/ai-review-core';

import {requireEnv, setOutput} from './gha.js';
import {readBotReviewBodies} from './reviews.js';
import {requirePrNumber, requireRepo} from './validate.js';

function main(): void {
  const repo = requireRepo(requireEnv('GH_REPO'));
  const prNumber = requirePrNumber(requireEnv('PR_NUMBER'));

  const marker = parseLatestMarker(readBotReviewBodies(repo, prNumber));

  // Empty output is read by gate.ts as "unreadable" → fail safe.
  setOutput('verdict', marker?.verdict ?? '');
  console.log(`Read verdict: ${marker?.verdict ?? '(none)'}`);
}

main();
