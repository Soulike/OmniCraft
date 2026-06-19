import type {Verdict} from '@omnicraft/ai-review-core';
import {decideGate} from '@omnicraft/ai-review-core';

import {optionalEnv, requireEnv} from './gha.js';
import {applyLabel} from './labels.js';
import {createGitHubClient} from './octokit.js';
import {requirePrNumber} from './validate.js';

/** A GitHub Actions job result string. */
type JobResult = 'success' | 'failure' | 'cancelled' | 'skipped' | '';

const KNOWN_RESULTS: readonly JobResult[] = [
  'success',
  'failure',
  'cancelled',
  'skipped',
  '',
];

/**
 * Coerces a raw env string into a known {@link JobResult}. Any unexpected value
 * (a future Actions result, or a workflow bug) maps to `''`, which blocks —
 * preserving fail-closed behavior rather than trusting an unknown string.
 */
function normalizeJobResult(value: string): JobResult {
  return (KNOWN_RESULTS as readonly string[]).includes(value)
    ? (value as JobResult)
    : '';
}

/**
 * Whether an upstream job result should block the gate. `failure`/`cancelled`
 * block, and an empty string (a result the workflow failed to pass, or an
 * unknown value normalized to `''`) is treated as blocking, to preserve
 * fail-closed behavior. `skipped` does not block: review/confirm are
 * legitimately skipped on the no-new-commits carry-forward path.
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

async function main(): Promise<void> {
  const client = createGitHubClient();
  const prNumber = Number(requirePrNumber(requireEnv('PR_NUMBER')));

  const upstream: JobResult[] = [
    normalizeJobResult(optionalEnv('CONFIG_RESULT')),
    normalizeJobResult(optionalEnv('PREPARE_RESULT')),
    normalizeJobResult(optionalEnv('REVIEW_RESULT')),
    normalizeJobResult(optionalEnv('CONFIRM_RESULT')),
  ];
  const anyUpstreamFailed = upstream.some(isFailedOrCancelled);

  const decision = decideGate({
    anyUpstreamFailed,
    hasChanges: optionalEnv('HAS_CHANGES') === 'true',
    carriedVerdict: asVerdict(optionalEnv('CARRIED_VERDICT')),
    postedVerdict: asVerdict(optionalEnv('POSTED_VERDICT')),
  });

  await applyLabel(client, prNumber, decision.label);

  console.log(
    `Gate decision: exit=${decision.exitCode} ` +
      `label=${decision.label ?? '(unchanged)'}`,
  );
  process.exit(decision.exitCode);
}

await main();
