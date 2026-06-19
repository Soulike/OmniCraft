import type {GateLabel} from '@omnicraft/ai-review-core';

import {run} from './git.js';

const LABELS: readonly GateLabel[] = ['AI Approved', 'AI Need Change'];

/** Hex colors (no `#`) for each gate label: green for approved, red for blocked. */
const LABEL_COLORS: Record<GateLabel, string> = {
  'AI Approved': '0e8a16',
  'AI Need Change': 'd73a4a',
};

/** Ensures both gate labels exist in the repo, creating any that are missing. */
function ensureLabelsExist(repo: string): void {
  for (const label of LABELS) {
    try {
      run('gh', ['api', `repos/${repo}/labels/${encodeURIComponent(label)}`]);
    } catch {
      run('gh', [
        'api',
        '--method',
        'POST',
        `repos/${repo}/labels`,
        '-f',
        `name=${label}`,
        '-f',
        `color=${LABEL_COLORS[label]}`,
      ]);
    }
  }
}

/**
 * Applies `label` to the PR and removes the opposite gate label, creating the
 * labels first if needed. A no-op when `label` is `null`.
 */
export function applyLabel(
  repo: string,
  prNumber: string,
  label: GateLabel | null,
): void {
  if (label === null) {
    return;
  }
  ensureLabelsExist(repo);

  const opposite = LABELS.find((candidate) => candidate !== label);
  if (opposite !== undefined) {
    try {
      run('gh', [
        'api',
        '--method',
        'DELETE',
        `repos/${repo}/issues/${prNumber}/labels/${encodeURIComponent(opposite)}`,
      ]);
    } catch {
      // The opposite label was not present; nothing to remove.
    }
  }

  run('gh', [
    'api',
    '--method',
    'POST',
    `repos/${repo}/issues/${prNumber}/labels`,
    '-f',
    `labels[]=${label}`,
  ]);
}
