import assert from 'node:assert';
import {spawn} from 'node:child_process';
import {Readable} from 'node:stream';

import {createTempFileWriteStream} from '@/helpers/fs.js';

/** Result of executing a shell command. */
export interface CommandResult {
  /** Path to the temp file containing stdout. */
  stdoutFile: string;
  /** Path to the temp file containing stderr. */
  stderrFile: string;
  /** Working directory after the command ran, or null if unavailable. */
  cwd: string | null;
  /** Process exit code. */
  exitCode: number;
  /** Whether the command was killed due to timeout. */
  timedOut: boolean;
}

/**
 * Wraps a user command so that, after it runs, the shell writes
 * the current working directory to fd 3. The original exit code is preserved.
 */
function wrapCommand(userCommand: string): string {
  return [userCommand, '__omni_ec=$?', 'pwd >&3', 'exit $__omni_ec'].join('\n');
}

/**
 * Executes a shell command, streaming stdout and stderr to temp files.
 * CWD is captured via fd 3. Supports timeout and abort signal.
 */
export async function executeCommand(
  command: string,
  cwd: string,
  timeout: number,
  signal?: AbortSignal,
): Promise<CommandResult> {
  const wrappedCommand = wrapCommand(command);
  const shell = process.env.SHELL ?? '/bin/sh';

  const stdoutFile = createTempFileWriteStream('.txt');
  const stderrFile = createTempFileWriteStream('.txt');

  // Set up finish promises before spawn so no event is missed
  const stdoutFinished = new Promise<void>((resolve) => {
    stdoutFile.stream.on('finish', resolve);
  });
  const stderrFinished = new Promise<void>((resolve) => {
    stderrFile.stream.on('finish', resolve);
  });

  const child = spawn(shell, ['-l', '-c', wrappedCommand], {
    cwd,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
  });

  assert(child.stdout, 'stdout must be piped');
  assert(child.stderr, 'stderr must be piped');

  child.stdout.on('data', (chunk: Buffer) => {
    stdoutFile.stream.write(chunk);
  });
  child.stderr.on('data', (chunk: Buffer) => {
    stderrFile.stream.write(chunk);
  });

  // Collect CWD from fd 3 (just a path string, tiny)
  const fd3 = child.stdio[3];
  assert(fd3 instanceof Readable, 'fd 3 must be a readable pipe');
  let cwdData = '';
  fd3.on('data', (chunk: Buffer) => {
    cwdData += chunk.toString();
  });

  // Timeout and abort handling
  const state = {timedOut: false};

  const killChild = (): void => {
    child.kill('SIGKILL');
  };

  const timer = setTimeout(() => {
    state.timedOut = true;
    killChild();
  }, timeout);

  if (signal) {
    if (signal.aborted) {
      killChild();
    } else {
      signal.addEventListener('abort', killChild, {once: true});
    }
  }

  // Wait for process exit, then end write streams
  const exitCode = await new Promise<number>((resolve, reject) => {
    child.on('exit', (code) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', killChild);
      stdoutFile.stream.end();
      stderrFile.stream.end();
      resolve(code ?? 1);
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', killChild);
      stdoutFile.stream.end();
      stderrFile.stream.end();
      reject(err);
    });
  });

  // Wait for file streams to finish flushing
  await Promise.all([stdoutFinished, stderrFinished]);

  return {
    stdoutFile: stdoutFile.filePath,
    stderrFile: stderrFile.filePath,
    cwd: cwdData.trim() || null,
    exitCode,
    timedOut: state.timedOut,
  };
}
