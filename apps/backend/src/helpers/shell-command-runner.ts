import assert from 'node:assert';
import type {ChildProcess} from 'node:child_process';
import {spawn} from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

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
 * stdout and stderr to temp files. CWD is written to a separate
 * temp file via shell redirection, keeping stdout clean.
 *
 * Each instance is single-use — call {@link run} exactly once.
 */
export class ShellCommandRunner {
  private readonly command: string;
  private readonly cwd: string;
  private readonly timeout: number;
  private readonly signal?: AbortSignal;
  private readonly cwdFilePath: string;

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
    this.cwdFilePath = path.join(
      os.tmpdir(),
      `omni-cwd-${crypto.randomUUID()}.txt`,
    );
  }

  /** Executes the command. Can only be called once per instance. */
  async run(): Promise<ShellCommandResult> {
    assert(!this.executed, 'run() can only be called once');
    this.executed = true;

    const stdoutFile = createTempFileWriteStream('.txt');
    const stderrFile = createTempFileWriteStream('.txt');

    const stdoutFinished = new Promise<void>((resolve) => {
      stdoutFile.stream.on('finish', resolve);
    });
    const stderrFinished = new Promise<void>((resolve) => {
      stderrFile.stream.on('finish', resolve);
    });

    try {
      const child = this.spawnShell();

      this.pipeStreams(child, stdoutFile.stream, stderrFile.stream);

      const [exitCode, timedOut] = await this.waitForExit(child);

      stdoutFile.stream.end();
      stderrFile.stream.end();
      await Promise.all([stdoutFinished, stderrFinished]);

      const cwd = await this.readCwdFile();

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
      // Files may not exist if spawn failed before writing
      void fs.unlink(stdoutFile.filePath).catch(() => {
        /* ignored */
      });
      void fs.unlink(stderrFile.filePath).catch(() => {
        /* ignored */
      });
      void fs.unlink(this.cwdFilePath).catch(() => {
        /* ignored */
      });
      throw error;
    }
  }

  /** Spawns the user's login shell. */
  private spawnShell(): ChildProcess {
    const wrappedCommand = this.wrapCommand();
    const shell = process.env.SHELL ?? '/bin/sh';

    return spawn(shell, ['-l', '-c', wrappedCommand], {
      cwd: this.cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }

  /**
   * Wraps the user command so that CWD is written to a temp file
   * via shell redirection. The original exit code is preserved.
   */
  private wrapCommand(): string {
    return [
      this.command,
      '__omni_ec=$?',
      `pwd > ${this.cwdFilePath}`,
      'exit $__omni_ec',
    ].join('\n');
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

  /** Reads CWD from the temp file, then deletes it. */
  private async readCwdFile(): Promise<string | null> {
    try {
      const content = await fs.readFile(this.cwdFilePath, 'utf-8');
      return content.trim() || null;
    } catch {
      return null;
    } finally {
      // CWD file may not exist if command was killed before pwd ran
      void fs.unlink(this.cwdFilePath).catch(() => {
        /* ignored */
      });
    }
  }

  /**
   * Waits for the child process to exit.
   * Handles timeout and abort signal.
   * Returns [exitCode, timedOut].
   */
  private waitForExit(child: ChildProcess): Promise<[number, boolean]> {
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
