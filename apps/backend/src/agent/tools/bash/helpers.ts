/**
 * Wraps a user command so that, after it runs, the shell writes
 * the current working directory to fd 3. The original exit code is preserved.
 *
 * Requires the shell to be spawned with fd 3 open as a writable pipe.
 */
export function wrapCommand(userCommand: string): string {
  return [userCommand, '__omni_ec=$?', 'pwd >&3', 'exit $__omni_ec'].join('\n');
}
