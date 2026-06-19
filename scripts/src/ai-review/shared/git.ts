import {execFileSync} from 'node:child_process';

/** Runs a command, returning trimmed stdout. Throws on a non-zero exit. */
export function run(command: string, args: readonly string[]): string {
  return execFileSync(command, args, {encoding: 'utf8'}).trim();
}

/**
 * Runs `git merge-base --is-ancestor <ancestor> <descendant>` and returns
 * whether the first commit is an ancestor of the second. Git exits 0 for true
 * and 1 for false. A higher exit (e.g. 128 when `ancestor` is not a valid commit
 * — the normal force-push/rebase case, where the old reviewed-head is no longer
 * reachable) is also treated as `false` so the caller falls back to a full
 * review rather than crashing. `--` terminates option parsing so a `-`-leading
 * revision argument cannot be read as a flag.
 */
export function isAncestor(ancestor: string, descendant: string): boolean {
  try {
    execFileSync(
      'git',
      ['merge-base', '--is-ancestor', '--', ancestor, descendant],
      {stdio: 'ignore'},
    );
    return true;
  } catch {
    // Exit 1 (not an ancestor) and exit >1 (unknown revision after a history
    // rewrite) both mean "treat as not an ancestor" → full review.
    return false;
  }
}
