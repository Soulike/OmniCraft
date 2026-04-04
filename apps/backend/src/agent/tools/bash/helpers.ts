import crypto from 'node:crypto';

/** Result of wrapping a command with CWD tracking. */
export interface WrappedCommand {
  /** The shell command string to execute (includes marker + pwd). */
  command: string;
  /** Opaque token — pass to `parseWrappedOutput` to extract results. */
  marker: string;
}

/** Parsed result from a wrapped command's stdout. */
export interface WrappedOutput {
  /** The original command's stdout, with marker lines stripped. */
  commandOutput: string;
  /** The CWD after execution, or null if the marker was not found (e.g. timeout). */
  newCwd: string | null;
}

/**
 * Wraps a user command so that, after it runs, the shell prints
 * a unique marker followed by `pwd`. The original exit code is preserved.
 */
export function wrapCommand(userCommand: string): WrappedCommand {
  const marker = `__OMNI_CWD_${crypto.randomUUID().replaceAll('-', '')}__`;
  const command = [
    userCommand,
    '__omni_ec=$?',
    `printf '\\n${marker}\\n'`,
    'pwd',
    'exit $__omni_ec',
  ].join('\n');
  return {command, marker};
}

/**
 * Parses stdout produced by a wrapped command.
 * Splits at the marker to separate the real command output from the CWD line.
 */
export function parseWrappedOutput(
  stdout: string,
  marker: string,
): WrappedOutput {
  const markerIndex = stdout.lastIndexOf(marker);
  if (markerIndex === -1) {
    return {commandOutput: stdout, newCwd: null};
  }

  const commandOutput = stdout.substring(0, markerIndex).replace(/\n$/, '');
  const afterMarker = stdout.substring(markerIndex + marker.length).trim();
  const newCwd = afterMarker.split('\n')[0]?.trim() || null;

  return {commandOutput, newCwd};
}

/** Error shape thrown by `execFile` on non-zero exit or timeout. */
export interface ExecError extends Error {
  stdout: string;
  stderr: string;
  code: number | null;
  killed: boolean;
}

/** Type guard for `ExecError` (non-zero exit, timeout, or maxBuffer). */
export function isExecError(error: unknown): error is ExecError {
  return (
    error instanceof Error &&
    'stdout' in error &&
    'stderr' in error &&
    'killed' in error
  );
}
