import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import type {Readable} from 'node:stream';

import {z} from 'zod';

import type {
  ToolDefinition,
  ToolExecutionContext,
} from '@/agent-core/tool/index.js';
import {createTempFileWriteStream} from '@/helpers/fs.js';

import {isSubPathOrSelf} from '../file/helpers.js';
import {wrapCommand} from './helpers.js';

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_TIMEOUT_MS = 600_000;
const MAX_INLINE_BYTES = 32_768; // 32KB

const parameters = z.object({
  command: z.string().min(1).describe('The shell command to execute'),
  timeout: z
    .number()
    .int()
    .min(1)
    .max(MAX_TIMEOUT_MS)
    .optional()
    .describe(
      `Timeout in milliseconds (default: ${DEFAULT_TIMEOUT_MS}, max: ${MAX_TIMEOUT_MS})`,
    ),
});

type RunCommandArgs = z.infer<typeof parameters>;

/** Built-in tool that executes a shell command. */
export const runCommandTool: ToolDefinition<typeof parameters> = {
  name: 'run_command',
  displayName: 'Run Command',
  description:
    'Executes a shell command and returns its output. ' +
    'The working directory persists across calls. ' +
    'Shell state (env vars, aliases) does not persist.',
  parameters,
  async execute(
    args: RunCommandArgs,
    context: ToolExecutionContext,
  ): Promise<string> {
    const {shellState, workingDirectory} = context;
    const timeout = args.timeout ?? DEFAULT_TIMEOUT_MS;

    const wrappedCommand = wrapCommand(args.command);
    const shell = process.env.SHELL ?? '/bin/sh';

    // Stream stdout and stderr to temp files; fd 3 carries CWD
    const stdoutFile = createTempFileWriteStream('.txt');
    const stderrFile = createTempFileWriteStream('.txt');

    const child = spawn(shell, ['-l', '-c', wrappedCommand], {
      cwd: shellState.cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
    });

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutFile.stream.write(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderrFile.stream.write(chunk);
    });

    // Collect CWD from fd 3 (just a path string, tiny)
    const fd3 = child.stdio[3] as Readable;
    let cwdData = '';
    fd3.on('data', (chunk: Buffer) => {
      cwdData += chunk.toString();
    });

    // Set up finish promises before they can resolve
    const stdoutFinished = new Promise<void>((resolve) => {
      stdoutFile.stream.on('finish', resolve);
    });
    const stderrFinished = new Promise<void>((resolve) => {
      stderrFile.stream.on('finish', resolve);
    });

    // Timeout handling — use object to avoid TS narrowing the flag to false
    const state = {timedOut: false};
    const timer = setTimeout(() => {
      state.timedOut = true;
      child.kill('SIGKILL');
    }, timeout);

    // Wait for process exit, then end write streams
    const exitCode = await new Promise<number>((resolve, reject) => {
      child.on('exit', (code) => {
        clearTimeout(timer);
        stdoutFile.stream.end();
        stderrFile.stream.end();
        resolve(code ?? 1);
      });
      child.on('error', (err) => {
        clearTimeout(timer);
        stdoutFile.stream.end();
        stderrFile.stream.end();
        reject(err);
      });
    });

    // Wait for file streams to finish flushing
    await Promise.all([stdoutFinished, stderrFinished]);

    // Check file sizes
    const [stdoutStat, stderrStat] = await Promise.all([
      fs.stat(stdoutFile.filePath),
      fs.stat(stderrFile.filePath),
    ]);

    // Resolve stdout: inline or file path
    let stdoutContent: string;
    if (stdoutStat.size <= MAX_INLINE_BYTES) {
      stdoutContent = await fs.readFile(stdoutFile.filePath, 'utf-8');
      await fs.unlink(stdoutFile.filePath);
    } else {
      stdoutContent = `Output saved to file: ${stdoutFile.filePath}`;
    }

    // Resolve stderr: inline or file path
    let stderrContent: string | null = null;
    if (stderrStat.size > 0) {
      if (stderrStat.size <= MAX_INLINE_BYTES) {
        stderrContent = await fs.readFile(stderrFile.filePath, 'utf-8');
        await fs.unlink(stderrFile.filePath);
      } else {
        stderrContent = `stderr saved to file: ${stderrFile.filePath}`;
      }
    } else {
      await fs.unlink(stderrFile.filePath);
    }

    // Parse CWD from fd 3
    const newCwd = cwdData.trim() || null;
    let cwdMessage = '';
    if (newCwd) {
      if (isSubPathOrSelf(workingDirectory, newCwd)) {
        if (newCwd !== shellState.cwd) {
          shellState.cwd = newCwd;
          cwdMessage = `\n(Working directory: ${newCwd})`;
        }
      } else {
        shellState.cwd = workingDirectory;
        cwdMessage = `\n(Working directory reset to: ${workingDirectory})`;
      }
    }

    // Assemble output
    let output = '';

    if (state.timedOut) {
      output += `Error: Command timed out after ${timeout}ms\n`;
    }

    output += stdoutContent;

    if (stderrContent) {
      output += `\n(stderr)\n${stderrContent}`;
    }

    if (exitCode !== 0) {
      output += `\nExit code: ${exitCode}`;
    }

    output += cwdMessage;
    output = output.trim();

    if (!output) {
      return '(No output)';
    }

    return output;
  },
};
