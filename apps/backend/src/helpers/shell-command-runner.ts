import assert from 'node:assert';
import type {ChildProcess} from 'node:child_process';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import {Readable} from 'node:stream';

import {createTempFileWriteStream} from './fs.js';

/** Result returned by {@link ShellCommandRunner.run}. */
export interface ShellCommandResult {
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
 * Executes a shell command in the user's default shell, streaming
 * stdout and stderr to temp files. CWD is captured via fd 3.
 *
 * Each instance is single-use — call {@link run} exactly once.
 */
export class ShellCommandRunner {
  private readonly command: string;
  private readonly cwd: string;
  private readonly timeout: number;
  private readonly signal?: AbortSignal;

  private executed = false;

  constructor(
    command: string,
    cwd: string,
    timeout: number,
    signal?: AbortSignal,
  ) {
    this.command = command;
    this.cwd = cwd;
    this.timeout = timeout;
    this.signal = signal;
  }

  /** Executes the command. Can only be called once per instance. */
  async run(): Promise<ShellCommandResult> {
    assert(!this.executed, 'run() can only be called once');
    this.executed = true;

    const stdoutFile = createTempFileWriteStream('.txt');
    const stderrFile = createTempFileWriteStream('.txt');

    // Set up finish promises before spawn so no event is missed
    const stdoutFinished = new Promise<void>((resolve) => {
      stdoutFile.stream.on('finish', resolve);
    });
    const stderrFinished = new Promise<void>((resolve) => {
      stderrFile.stream.on('finish', resolve);
    });

    try {
      const child = this.spawnShell();

      this.pipeStreams(child, stdoutFile.stream, stderrFile.stream);

      const fd3 = child.stdio[3];
      assert(fd3 instanceof Readable, 'fd 3 must be a readable pipe');
      const cwdPromise = this.collectCwd(fd3);

      const exitPromise = this.waitForExit(
        child,
        stdoutFile.stream,
        stderrFile.stream,
      );

      const [exitCode, timedOut] = await exitPromise;
      // Force fd3 closed so collectCwd's async iterator exits after SIGKILL
      fd3.destroy();
      const [, , cwd] = await Promise.all([
        stdoutFinished,
        stderrFinished,
        cwdPromise,
      ]);

      return {
        stdoutFile: stdoutFile.filePath,
        stderrFile: stderrFile.filePath,
        cwd,
        exitCode,
        timedOut,
      };
    } catch (error) {
      stdoutFile.stream.destroy();
      stderrFile.stream.destroy();
      void fs.unlink(stdoutFile.filePath);
      void fs.unlink(stderrFile.filePath);
      throw error;
    }
  }

  /** Spawns the user's login shell with fd 3 for CWD capture. */
  private spawnShell(): ChildProcess {
    const wrappedCommand = this.wrapCommand();
    const shell = process.env.SHELL ?? '/bin/sh';

    return spawn(shell, ['-l', '-c', wrappedCommand], {
      cwd: this.cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
    });
  }

  /**
   * Wraps the user command so that the shell writes CWD to fd 3
   * and exits with the original exit code.
   */
  private wrapCommand(): string {
    return [this.command, '__omni_ec=$?', 'pwd >&3', 'exit $__omni_ec'].join(
      '\n',
    );
  }

  /** Pipes child stdout/stderr to write streams. */
  private pipeStreams(
    child: ChildProcess,
    stdoutStream: NodeJS.WritableStream,
    stderrStream: NodeJS.WritableStream,
  ): void {
    assert(child.stdout, 'stdout must be piped');
    assert(child.stderr, 'stderr must be piped');

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutStream.write(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderrStream.write(chunk);
    });
  }

  /** Collects CWD from fd 3 (a single path string). */
  private async collectCwd(fd3: Readable): Promise<string | null> {
    let data = '';
    try {
      for await (const chunk of fd3) {
        data += (chunk as Buffer).toString();
      }
    } catch {
      // Stream destroyed (e.g., after SIGKILL) — return what we have
    }
    return data.trim() || null;
  }

  /**
   * Waits for the child process to exit. Handles timeout and abort signal.
   * Ends the write streams after exit so `finish` events fire.
   * Returns [exitCode, timedOut].
   */
  private waitForExit(
    child: ChildProcess,
    stdoutStream: NodeJS.WritableStream,
    stderrStream: NodeJS.WritableStream,
  ): Promise<[number, boolean]> {
    let timedOut = false;

    const killChild = (): void => {
      child.kill('SIGKILL');
    };

    const timer = setTimeout(() => {
      timedOut = true;
      killChild();
    }, this.timeout);

    if (this.signal) {
      if (this.signal.aborted) {
        killChild();
      } else {
        this.signal.addEventListener('abort', killChild, {once: true});
      }
    }

    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        this.signal?.removeEventListener('abort', killChild);
        stdoutStream.end();
        stderrStream.end();
      };

      child.on('exit', (code) => {
        cleanup();
        resolve([code ?? 1, timedOut]);
      });
      child.on('error', (err) => {
        cleanup();
        reject(err);
      });
    });
  }
}
