import type {GateLabel} from '@omnicraft/ai-review-core';

import type {GitHubClient} from './shared/octokit.js';

const LABELS: readonly GateLabel[] = ['AI Approved', 'AI Need Change'];

/** Hex colors (no `#`) for each gate label: green for approved, red for blocked. */
const LABEL_COLORS: Record<GateLabel, string> = {
  'AI Approved': '0e8a16',
  'AI Need Change': 'd73a4a',
};

/** Whether an Octokit error is an HTTP 404 (resource not found). */
function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as {status?: number}).status === 404
  );
}

/** Ensures both gate labels exist in the repo, creating any that are missing. */
async function ensureLabelsExist(client: GitHubClient): Promise<void> {
  const {octokit, owner, repo} = client;
  for (const label of LABELS) {
    try {
      await octokit.rest.issues.getLabel({owner, repo, name: label});
    } catch (error) {
      // A 404 means the label does not exist yet → create it. Any other failure
      // (auth, rate limit, network) rethrows rather than being misread.
      if (!isNotFound(error)) {
        throw error;
      }
      await octokit.rest.issues.createLabel({
        owner,
        repo,
        name: label,
        color: LABEL_COLORS[label],
      });
    }
  }
}

/**
 * Applies `label` to the PR and removes the opposite gate label, creating the
 * labels first if needed. A no-op when `label` is `null`.
 */
export async function applyLabel(
  client: GitHubClient,
  prNumber: number,
  label: GateLabel | null,
): Promise<void> {
  if (label === null) {
    return;
  }
  const {octokit, owner, repo} = client;
  await ensureLabelsExist(client);

  const opposite = LABELS.find((candidate) => candidate !== label);
  if (opposite !== undefined) {
    try {
      await octokit.rest.issues.removeLabel({
        owner,
        repo,
        issue_number: prNumber,
        name: opposite,
      });
    } catch (error) {
      // A 404 means the opposite label was not on the PR — nothing to remove.
      // Any other failure rethrows and fails the job.
      if (!isNotFound(error)) {
        throw error;
      }
    }
  }

  await octokit.rest.issues.addLabels({
    owner,
    repo,
    issue_number: prNumber,
    labels: [label],
  });
}
