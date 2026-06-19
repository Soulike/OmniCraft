import {parseLatestMarker} from '@omnicraft/ai-review-core';

import {requireEnv, setOutput} from './gha.js';
import {run} from './git.js';

interface GhReview {
  readonly body?: string;
}

function main(): void {
  const repo = requireEnv('GH_REPO');
  const prNumber = requireEnv('PR_NUMBER');

  const json = run('gh', [
    'api',
    `repos/${repo}/pulls/${prNumber}/reviews`,
    '--paginate',
  ]);
  const reviews = JSON.parse(json) as GhReview[];
  const marker = parseLatestMarker(reviews.map((review) => review.body ?? ''));

  // Empty output is read by gate.ts as "unreadable" → fail safe.
  setOutput('verdict', marker?.verdict ?? '');
  console.log(`Read verdict: ${marker?.verdict ?? '(none)'}`);
}

main();
