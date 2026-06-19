import type {Verdict} from '@omnicraft/ai-review-core';
import {decideGate} from '@omnicraft/ai-review-core';

import {optionalEnv, requireEnv} from './gha.js';
import {applyLabel} from './labels.js';
import {requirePrNumber, requireRepo} from './validate.js';

/** A GitHub Actions job result string. */
type JobResult = 'success' | 'failure' | 'cancelled' | 'skipped' | '';

/**
 * Whether an upstream job result should block the gate. `failure`/`cancelled`
 * block, and an empty string (a result the workflow failed to pass) is treated
 * as unknown → blocking, to preserve fail-closed behavior. `skipped` does not
 * block: review/confirm are legitimately skipped on the no-new-commits
 * carry-forward path.
 */
function isFailedOrCancelled(result: JobResult): boolean {
  return result === 'failure' || result === 'cancelled' || result === '';
}

function asVerdict(value: string): Verdict | null {
  if (value === 'approved' || value === 'need_change') {
    return value;
  }
  return null;
}

function main(): void {
  const repo = requireRepo(requireEnv('GH_REPO'));
  const prNumber = requirePrNumber(requireEnv('PR_NUMBER'));

  const upstream: JobResult[] = [
    optionalEnv('CONFIG_RESULT') as JobResult,
    optionalEnv('PREPARE_RESULT') as JobResult,
    optionalEnv('REVIEW_RESULT') as JobResult,
    optionalEnv('CONFIRM_RESULT') as JobResult,
  ];
  const anyUpstreamFailed = upstream.some(isFailedOrCancelled);

  const decision = decideGate({
    anyUpstreamFailed,
    hasChanges: optionalEnv('HAS_CHANGES') === 'true',
    carriedVerdict: asVerdict(optionalEnv('CARRIED_VERDICT')),
    postedVerdict: asVerdict(optionalEnv('POSTED_VERDICT')),
  });

  applyLabel(repo, prNumber, decision.label);

  console.log(
    `Gate decision: exit=${decision.exitCode} ` +
      `label=${decision.label ?? '(unchanged)'}`,
  );
  process.exit(decision.exitCode);
}

main();
