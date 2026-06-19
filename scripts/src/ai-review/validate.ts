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

/**
 * Validates a PR number is a plain positive integer, returning its canonical
 * decimal form. Guards against a tainted `PR_NUMBER` reaching a command argv.
 */
export function requirePrNumber(value: string): string {
  if (!/^[0-9]+$/.test(value)) {
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
