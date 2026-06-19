import {execFileSync} from 'node:child_process';

/** Runs a command, returning trimmed stdout. Throws on a non-zero exit. */
export function run(command: string, args: readonly string[]): string {
  return execFileSync(command, args, {encoding: 'utf8'}).trim();
}

/**
 * Runs `git merge-base --is-ancestor <ancestor> <descendant>` and returns
 * whether the first commit is an ancestor of the second. Git exits 0 for true,
 * 1 for false, and >1 on error — only 1 is treated as `false`.
 */
export function isAncestor(ancestor: string, descendant: string): boolean {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], {
      stdio: 'ignore',
    });
    return true;
  } catch (error) {
    const code = (error as {status?: number}).status;
    if (code === 1) {
      return false;
    }
    throw error;
  }
}
