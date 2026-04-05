import assert from 'node:assert';
import type {ChildProcess} from 'node:child_process';
import {spawn} from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';

import {createTempFileWriteStream} from './fs.js';

/** Result returned by {@link ShellCommandRunner.run}. */
export interface ShellCommandResult {
  /** Path to the temp file containing stdout (marker stripped). */
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
 * stdout and stderr to temp files. CWD is extracted from a unique
 * marker appended to the command's stdout.
 *
 * Each instance is single-use — call {@link run} exactly once.
 */
export class ShellCommandRunner {
  private readonly command: string;
  private readonly cwd: string;
  private readonly timeout: number;
  private readonly signal?: AbortSignal;
  private readonly marker: string;

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
    this.marker = `__OMNI_CWD_${crypto.randomUUID().replaceAll('-', '')}__`;
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

      // End write streams and wait for flush
      stdoutFile.stream.end();
      stderrFile.stream.end();
      await Promise.all([stdoutFinished, stderrFinished]);

      const cwd = await this.extractCwd(stdoutFile.filePath);

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
   * Wraps the user command so that a unique marker and `pwd` are
   * appended to stdout. The original exit code is preserved.
   */
  private wrapCommand(): string {
    return [
      this.command,
      '__omni_ec=$?',
      `printf '\\n${this.marker}\\n'`,
      'pwd',
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

  /**
   * Reads the tail of the stdout file, finds the marker, extracts CWD,
   * and truncates the file to remove the marker lines.
   */
  private async extractCwd(stdoutFilePath: string): Promise<string | null> {
    const stat = await fs.stat(stdoutFilePath);
    if (stat.size === 0) return null;

    // Read the tail (marker + pwd is < 200 bytes, read 1KB to be safe)
    const tailSize = Math.min(stat.size, 1024);
    const handle = await fs.open(stdoutFilePath, 'r+');
    try {
      const buffer = Buffer.alloc(tailSize);
      await handle.read(buffer, 0, tailSize, stat.size - tailSize);
      const tail = buffer.toString('utf-8');

      const markerIndex = tail.lastIndexOf(this.marker);
      if (markerIndex === -1) return null;

      // Extract CWD from after the marker
      const afterMarker = tail
        .substring(markerIndex + this.marker.length)
        .trim();
      const cwd = afterMarker.split('\n')[0]?.trim() || null;

      // Find the newline before the marker to get the truncation point
      const tailBeforeMarker = tail.substring(0, markerIndex);
      const trailingNewline = tailBeforeMarker.endsWith('\n') ? 1 : 0;
      const bytesToKeep =
        stat.size -
        tailSize +
        Buffer.byteLength(tailBeforeMarker, 'utf-8') -
        trailingNewline;

      await handle.truncate(Math.max(0, bytesToKeep));

      return cwd;
    } finally {
      await handle.close();
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
