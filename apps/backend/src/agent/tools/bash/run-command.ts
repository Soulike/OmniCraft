import {realpathSync} from 'node:fs';
import fs from 'node:fs/promises';

import {z} from 'zod';

import type {
  ToolDefinition,
  ToolExecutionContext,
} from '@/agent-core/tool/index.js';
import {ShellCommandRunner} from '@/helpers/shell-command-runner.js';

import {isSubPathOrSelf} from '../file/helpers.js';

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

type ResolvedOutput =
  | {type: 'inline'; content: string}
  | {type: 'file'; filePath: string}
  | {type: 'empty'};

/**
 * Resolves a temp file to either inline content or a file-path reference.
 * Deletes the file when inlined or empty.
 */
async function resolveOutputFile(filePath: string): Promise<ResolvedOutput> {
  const stat = await fs.stat(filePath);
  if (stat.size === 0) {
    await fs.unlink(filePath);
    return {type: 'empty'};
  }
  if (stat.size <= MAX_INLINE_BYTES) {
    const content = await fs.readFile(filePath, 'utf-8');
    await fs.unlink(filePath);
    return {type: 'inline', content};
  }
  return {type: 'file', filePath};
}

/** Built-in tool that executes a shell command. */
export const runCommandTool: ToolDefinition<typeof parameters> = {
  name: 'run_command',
  displayName: 'Run Command',
  description:
    'Executes a shell command and returns its output. ' +
    'Only use this when no other tool can accomplish the task. ' +
    'The working directory persists across calls. ' +
    'Shell state (env vars, aliases) does not persist.',
  parameters,
  async execute(
    args: RunCommandArgs,
    context: ToolExecutionContext,
  ): Promise<string> {
    const {shellState, workingDirectory, signal} = context;
    const timeout = args.timeout ?? DEFAULT_TIMEOUT_MS;

    const result = await new ShellCommandRunner(
      args.command,
      shellState.cwd,
      timeout,
      signal,
    ).run();

    // Resolve stdout and stderr temp files
    const stdout = await resolveOutputFile(result.stdoutFile);
    const stderr = await resolveOutputFile(result.stderrFile);

    // CWD enforcement — resolve symlinks since pwd returns real paths
    let cwdMessage = '';
    if (result.cwd) {
      const realWorkingDir = realpathSync(workingDirectory);
      if (isSubPathOrSelf(realWorkingDir, result.cwd)) {
        if (result.cwd !== shellState.cwd) {
          shellState.cwd = result.cwd;
          cwdMessage = `\n(Working directory: ${result.cwd})`;
        }
      } else {
        shellState.cwd = workingDirectory;
        cwdMessage = `\n(Working directory reset to: ${workingDirectory})`;
      }
    }

    // Assemble output
    let output = '';

    if (result.timedOut) {
      output += `Error: Command timed out after ${timeout}ms\n`;
    }

    if (stdout.type === 'inline') {
      output += stdout.content;
    } else if (stdout.type === 'file') {
      output += `Output saved to file: ${stdout.filePath}`;
    }

    if (stderr.type === 'inline') {
      output += `\n(stderr)\n${stderr.content}`;
    } else if (stderr.type === 'file') {
      output += `\n(stderr saved to file: ${stderr.filePath})`;
    }

    if (result.exitCode !== 0) {
      output += `\nExit code: ${result.exitCode}`;
    }

    output += cwdMessage;
    output = output.trim();

    if (!output) {
      return '(No output)';
    }

    return output;
  },
};
