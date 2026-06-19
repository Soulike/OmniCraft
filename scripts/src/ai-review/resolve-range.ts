import {parseLatestMarker, resolveReviewRange} from '@omnicraft/ai-review-core';

import {fail, requireEnv, setOutput} from './gha.js';
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

/** Resolves PR number + head SHA from the workflow_run event payload. */
function resolvePull(repo: string, headSha: string): {prNumber: number} {
  const pullsJson = requireEnv('WORKFLOW_RUN_PULLS');
  const pulls = JSON.parse(pullsJson) as {number?: number}[];
  const first = pulls.at(0);
  if (first?.number !== undefined) {
    return {prNumber: Number(requirePrNumber(String(first.number)))};
  }
  // workflow_run sometimes carries no PRs; fall back to the commit's PRs.
  const fallback = run('gh', [
    'api',
    `repos/${repo}/commits/${headSha}/pulls`,
    '--jq',
    '.[0].number',
  ]);
  if (fallback === '' || fallback === 'null') {
    fail(`Could not resolve a PR for head ${headSha}.`);
  }
  return {prNumber: Number(requirePrNumber(fallback))};
}

function resolveContext(): PullContext {
  const repo = requireRepo(requireEnv('GH_REPO'));
  const headSha = requireSha(
    'WORKFLOW_RUN_HEAD_SHA',
    requireEnv('WORKFLOW_RUN_HEAD_SHA'),
  );
  const {prNumber} = resolvePull(repo, headSha);

  // Read base ref/sha straight from the PR.
  const baseRef = requireGitRef(
    'PR base ref',
    run('gh', ['api', `repos/${repo}/pulls/${prNumber}`, '--jq', '.base.ref']),
  );
  const baseSha = requireSha(
    'PR base sha',
    run('gh', ['api', `repos/${repo}/pulls/${prNumber}`, '--jq', '.base.sha']),
  );
  return {prNumber, headSha, baseSha, baseRef};
}

function readReviewBodies(repo: string, prNumber: number): string[] {
  return readBotReviewBodies(repo, String(prNumber));
}

function main(): void {
  const repo = requireRepo(requireEnv('GH_REPO'));
  const context = resolveContext();

  // Fetch the PR head and base into the trusted checkout for git ancestry ops.
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
    baseSha: context.baseSha,
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
