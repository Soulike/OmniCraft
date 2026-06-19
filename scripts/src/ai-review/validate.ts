import {fail} from './gha.js';

const REPO_PATTERN = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;
const SHA_PATTERN = /^[0-9a-fA-F]{7,64}$/;
const GIT_REF_PATTERN = /^[a-zA-Z0-9._/-]+$/;

/**
 * Validates `owner/repo` slugs before they reach a command argv. Guards against
 * a tainted `GH_REPO` smuggling extra path segments or argv flags into `gh`.
 * Exits the job (fail-closed) on a malformed value.
 */
export function requireRepo(value: string): string {
  if (!REPO_PATTERN.test(value)) {
    fail(`GH_REPO is not a valid owner/repo slug: ${JSON.stringify(value)}`);
  }
  return value;
}

const MAX_SAFE_INTEGER_STR = String(Number.MAX_SAFE_INTEGER);

/**
 * Validates a PR number is a positive integer with no leading zeros, within the
 * JS safe-integer range, and returns it unchanged. Rejects `0`, leading zeros
 * (`01`), non-digits, and out-of-range values. The range check is done on the
 * string (length, then lexicographic compare for equal length) rather than via
 * `Number()`, so a huge value cannot round *into* the safe range and slip
 * through. Guards against a tainted `PR_NUMBER` reaching a command argv.
 */
export function requirePrNumber(value: string): string {
  const inRange =
    value.length < MAX_SAFE_INTEGER_STR.length ||
    (value.length === MAX_SAFE_INTEGER_STR.length &&
      value <= MAX_SAFE_INTEGER_STR);
  if (!/^[1-9][0-9]*$/.test(value) || !inRange) {
    fail(`PR_NUMBER is not a positive integer: ${JSON.stringify(value)}`);
  }
  return value;
}

/**
 * Validates a commit SHA (hex, 7–64 chars). Guards against a tainted head SHA
 * being parsed as a flag or path by `gh`/`git`.
 */
export function requireSha(name: string, value: string): string {
  if (!SHA_PATTERN.test(value)) {
    fail(`${name} is not a valid commit SHA: ${JSON.stringify(value)}`);
  }
  return value;
}

/**
 * Validates a git ref name (branch/tag). Rejects leading dashes and shell-/
 * flag-significant characters so a collaborator-controlled base branch name
 * cannot smuggle a `git fetch` flag.
 */
export function requireGitRef(name: string, value: string): string {
  if (value.startsWith('-') || !GIT_REF_PATTERN.test(value)) {
    fail(`${name} is not a valid git ref: ${JSON.stringify(value)}`);
  }
  return value;
}
