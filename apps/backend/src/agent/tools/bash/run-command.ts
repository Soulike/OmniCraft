import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

import {z} from 'zod';

import type {
  ToolDefinition,
  ToolExecutionContext,
} from '@/agent-core/tool/index.js';

import {isSubPathOrSelf} from '../file/helpers.js';
import {isExecError, parseWrappedOutput, wrapCommand} from './helpers.js';

const execFileAsync = promisify(execFile);

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_TIMEOUT_MS = 600_000;
const MAX_OUTPUT_BYTES = 32_768; // 32KB
const MAX_BUFFER_BYTES = 1_048_576; // 1MB

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

    const wrapped = wrapCommand(args.command);
    const shell = process.env.SHELL ?? '/bin/sh';

    let stdout: string;
    let stderr: string;
    let exitCode = 0;
    let timedOut = false;

    try {
      const result = await execFileAsync(shell, ['-l', '-c', wrapped.command], {
        cwd: shellState.cwd,
        timeout,
        maxBuffer: MAX_BUFFER_BYTES,
        env: process.env,
      });
      stdout = result.stdout;
      stderr = result.stderr;
    } catch (error: unknown) {
      if (isExecError(error)) {
        stdout = error.stdout;
        stderr = error.stderr;
        timedOut = error.killed;
        exitCode = error.code ?? 1;
      } else {
        const message = error instanceof Error ? error.message : String(error);
        return `Error: ${message}`;
      }
    }

    const {commandOutput, newCwd} = parseWrappedOutput(stdout, wrapped.marker);

    let cwdMessage = '';
    if (newCwd) {
      if (isSubPathOrSelf(workingDirectory, newCwd)) {
        if (newCwd !== shellState.cwd) {
          shellState.cwd = newCwd;
          cwdMessage = `\n(Working directory: ${newCwd})`;
        }
      } else {
        shellState.cwd = workingDirectory;
        cwdMessage =
          `\n(Working directory reset to: ${workingDirectory}` +
          ` — target was outside allowed directory)`;
      }
    }

    let output = '';

    if (timedOut) {
      output += `Error: Command timed out after ${timeout}ms\n`;
    }

    output += commandOutput;

    if (stderr) {
      output += `\n(stderr)\n${stderr}`;
    }

    if (exitCode !== 0) {
      output += `\nExit code: ${exitCode}`;
    }

    output += cwdMessage;
    output = output.trim();

    if (!output) {
      return '(No output)';
    }

    if (Buffer.byteLength(output) > MAX_OUTPUT_BYTES) {
      const truncated = Buffer.from(output)
        .subarray(0, MAX_OUTPUT_BYTES)
        .toString('utf-8');
      return truncated + '\n(Output truncated: exceeded 32KB limit)';
    }

    return output;
  },
};
