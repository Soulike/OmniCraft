import {realpathSync} from 'node:fs';
import fs from 'node:fs/promises';

import {
  INTERNAL_TOOL_NAME,
  RUN_COMMAND_DEFAULT_TIMEOUT_MS,
  runCommandParametersSchema,
  runCommandResultSchema,
} from '@omnicraft/tool-schemas';
import {z} from 'zod';

import type {
  ToolDefinition,
  ToolExecutionContext,
} from '@/agent-core/tool/index.js';
import {isSubPathOrSelf} from '@/helpers/path-helpers.js';
import {ShellCommandRunner} from '@/helpers/shell-command-runner.js';

const MAX_INLINE_BYTES = 32_768; // 32KB

const parameters = runCommandParametersSchema;

type RunCommandArgs = z.infer<typeof parameters>;
type RunCommandResult = z.infer<typeof runCommandResultSchema>;

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

function resolvedOutputToString(resolved: ResolvedOutput): string {
  switch (resolved.type) {
    case 'inline':
      return resolved.content;
    case 'file':
      return `Output saved to file: ${resolved.filePath}`;
    case 'empty':
      return '';
  }
}

/** Built-in tool that executes a shell command. */
export const runCommandTool: ToolDefinition<
  typeof parameters,
  RunCommandResult
> = {
  kind: 'internal',
  name: INTERNAL_TOOL_NAME.RUN_COMMAND,
  displayName: 'Run Command',
  description:
    'Executes a shell command and returns its output. ' +
    'Only use this when no other tool can accomplish the task. ' +
    'The working directory persists across calls. ' +
    'Shell state (env vars, aliases) does not persist.',
  parameters,
  suppressToolEvents: false,
  compactResult({content, status, toolCall}) {
    let command = '';
    try {
      const args = JSON.parse(toolCall.arguments) as {command?: string};
      command = args.command ?? '';
    } catch {
      // Keep command empty when arguments are not valid JSON.
    }

    const importantLines = content
      .split('\n')
      .filter((line) =>
        /Error:|Exit code:|Working directory|Output saved to file|stderr saved to file|Command timed out/i.test(
          line,
        ),
      );

    return [
      `${INTERNAL_TOOL_NAME.RUN_COMMAND} ${status}`,
      command ? `Command: ${command}` : '',
      ...importantLines.slice(0, 20),
    ]
      .filter(Boolean)
      .join('\n');
  },
  async execute(
    args: RunCommandArgs,
    context: ToolExecutionContext,
    onOutput?: (chunk: string) => void,
  ) {
    const {shellState, workingDirectory, signal} = context;
    const timeout = args.timeout ?? RUN_COMMAND_DEFAULT_TIMEOUT_MS;

    const result = await new ShellCommandRunner(
      args.command,
      shellState.cwd,
      timeout,
      signal,
    ).run({onStdoutData: onOutput});

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
      const data: RunCommandResult = {
        command: args.command,
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        cwd: shellState.cwd,
        stdout: '',
        stderr: '',
      };
      return {data, content: '(No output)', status: 'success'};
    }

    const failed = result.timedOut || result.exitCode !== 0;
    if (failed) {
      return {
        data: {message: output},
        content: output,
        status: 'failure',
      };
    }

    const data: RunCommandResult = {
      command: args.command,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      cwd: shellState.cwd,
      stdout: resolvedOutputToString(stdout),
      stderr: resolvedOutputToString(stderr),
    };
    return {data, content: output, status: 'success'};
  },
};
