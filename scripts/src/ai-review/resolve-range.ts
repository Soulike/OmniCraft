import {parseLatestMarker, resolveReviewRange} from '@omnicraft/ai-review-core';

import {requireEnv, setOutput} from './gha.js';
import {isAncestor, run} from './git.js';
import {readBotReviewBodies} from './reviews.js';
import {
  requireGitRef,
  requirePrNumber,
  requireRepo,
  requireSha,
} from './validate.js';

interface PullContext {
  readonly prNumber: number;
  readonly headSha: string;
  readonly baseSha: string;
  readonly baseRef: string;
}

/** Resolves and validates PR context from the `pull_request` event env. */
function resolveContext(): PullContext {
  const prNumber = Number(requirePrNumber(requireEnv('PR_NUMBER')));
  const headSha = requireSha('PR_HEAD_SHA', requireEnv('PR_HEAD_SHA'));
  const baseSha = requireSha('PR_BASE_SHA', requireEnv('PR_BASE_SHA'));
  const baseRef = requireGitRef('PR_BASE_REF', requireEnv('PR_BASE_REF'));
  return {prNumber, headSha, baseSha, baseRef};
}

function readReviewBodies(repo: string, prNumber: number): string[] {
  return readBotReviewBodies(repo, String(prNumber));
}

function main(): void {
  const repo = requireRepo(requireEnv('GH_REPO'));
  const context = resolveContext();

  // Fetch the PR head and base into the checkout for git ancestry ops.
  // `--` stops git from parsing a `-`-leading ref as a flag (defense in depth;
  // baseRef is already validated by requireGitRef).
  run('git', ['fetch', 'origin', '--', context.baseRef]);
  run('git', ['fetch', 'origin', '--', `pull/${context.prNumber}/head`]);

  const previousMarker = parseLatestMarker(
    readReviewBodies(repo, context.prNumber),
  );

  const startIsAncestorOfHead =
    previousMarker !== null &&
    isAncestor(previousMarker.reviewedHead, context.headSha);

  const range = resolveReviewRange({
    headSha: context.headSha,
    previousMarker,
    startIsAncestorOfHead,
  });

  setOutput('pr_number', String(context.prNumber));
  setOutput('head_sha', context.headSha);
  setOutput('base_sha', context.baseSha);
  setOutput('base_ref', context.baseRef);
  setOutput('start_sha', range.startSha ?? '');
  setOutput('is_full', String(range.isFull));
  setOutput('has_changes', String(range.hasChanges));
  setOutput('carried_verdict', range.carriedVerdict ?? '');

  console.log(
    `PR #${context.prNumber}: head=${context.headSha} ` +
      `start=${range.startSha ?? '(full)'} isFull=${range.isFull} ` +
      `hasChanges=${range.hasChanges} carried=${range.carriedVerdict ?? '-'}`,
  );
}

main();
