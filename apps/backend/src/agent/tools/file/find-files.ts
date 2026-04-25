import assert from 'node:assert';
import type {Stats} from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  findFilesParametersSchema,
  findFilesResultSchema,
  TOOL_NAME,
} from '@omnicraft/tool-schemas';
import fg from 'fast-glob';
import {z} from 'zod';

import type {
  ToolDefinition,
  ToolExecutionContext,
} from '@/agent-core/tool/index.js';

import {
  checkExistingFileAccess,
  checkLexicalFileAccess,
  getFileAccessPolicyGlobIgnorePatterns,
  hasFileAccessPolicyIgnoredDescendant,
  isPathThroughSymbolicLink,
} from './file-access-policy.js';
import {
  formatBlockedFileAccessMessage,
  skippedByFileAccessPolicyMessage,
} from './file-access-policy-messages.js';
import {searchFilesTool} from './search-files.js';

const MAX_RESULTS = 100;
const TIMEOUT_MS = 30_000;

const parameters = findFilesParametersSchema;

type FindFilesArgs = z.infer<typeof parameters>;
type FindFilesResult = z.infer<typeof findFilesResultSchema>;

/** Built-in tool that searches for files matching a glob pattern. */
export const findFilesTool: ToolDefinition<typeof parameters, FindFilesResult> =
  {
    name: TOOL_NAME.FIND_FILES,
    displayName: 'Find Files',
    description:
      'Searches for files matching a glob pattern and returns their paths. ' +
      'Use this to locate files by name or extension (e.g., find all TypeScript files, locate a config file). ' +
      'Symlinked directories and files are not traversed or returned. ' +
      'If expected files are missing from results, review whether they are behind a symlink; ' +
      'do not attempt to bypass file access policy. ' +
      `To search file contents instead, use ${searchFilesTool.name}.`,
    parameters,
    suppressToolEvents: false,
    async execute(args: FindFilesArgs, context: ToolExecutionContext) {
      const {workingDirectory} = context;

      // 1. Resolve search directory
      const searchDir = path.resolve(workingDirectory, args.path ?? '.');

      const lexicalRootPolicy = checkLexicalFileAccess(searchDir);
      if (!lexicalRootPolicy.allowed) {
        const message = formatBlockedFileAccessMessage(args.path ?? searchDir);
        return {
          data: {message},
          content: message,
          status: 'failure',
        };
      }

      if (
        await isPathThroughSymbolicLink(workingDirectory, searchDir, {
          missingPathIsSymbolicLink: false,
        })
      ) {
        const message = formatBlockedFileAccessMessage(args.path ?? searchDir);
        return {
          data: {message},
          content: message,
          status: 'failure',
        };
      }

      // 2. Verify directory exists
      let stat: Stats;
      try {
        stat = await fs.stat(searchDir);
      } catch {
        return {
          data: {message: `Directory not found: ${args.path}`},
          content: `Error: Directory not found: ${args.path}`,
          status: 'failure',
        };
      }

      if (!stat.isDirectory()) {
        return {
          data: {message: `Not a directory: ${args.path}`},
          content: `Error: Not a directory: ${args.path}`,
          status: 'failure',
        };
      }

      const rootPolicy = await checkExistingFileAccess(searchDir);
      if (!rootPolicy.allowed) {
        const message = formatBlockedFileAccessMessage(args.path ?? searchDir);
        return {
          data: {message},
          content: message,
          status: 'failure',
        };
      }

      // 3. Run fast-glob with stream
      const stream = fg.stream(args.pattern, {
        cwd: searchDir,
        onlyFiles: false,
        dot: true,
        followSymbolicLinks: false,
        ignore: getFileAccessPolicyGlobIgnorePatterns(searchDir),
      });

      const entries: string[] = [];
      let timedOut = false;
      let skippedByPolicy =
        await hasFileAccessPolicyIgnoredDescendant(searchDir);

      try {
        const startTime = Date.now();
        for await (const entry of stream) {
          assert(typeof entry === 'string');
          const absoluteEntryPath = path.join(searchDir, entry);
          const entryPolicy = checkLexicalFileAccess(absoluteEntryPath);
          if (
            !entryPolicy.allowed ||
            (await isPathThroughSymbolicLink(
              workingDirectory,
              absoluteEntryPath,
            ))
          ) {
            skippedByPolicy = true;
            continue;
          }

          const realEntryPolicy =
            await checkExistingFileAccess(absoluteEntryPath);
          if (!realEntryPolicy.allowed) {
            skippedByPolicy = true;
            continue;
          }

          let entryStat: Stats;
          try {
            entryStat = await fs.stat(absoluteEntryPath);
          } catch {
            continue;
          }

          if (!entryStat.isFile()) {
            continue;
          }

          entries.push(entry);
          if (entries.length >= MAX_RESULTS) {
            break;
          }
          if (Date.now() - startTime > TIMEOUT_MS) {
            timedOut = true;
            break;
          }
        }
      } catch (error: unknown) {
        if (entries.length === 0) {
          const message =
            error instanceof Error ? error.message : String(error);
          return {
            data: {message},
            content: `Error: ${message}`,
            status: 'failure',
          };
        }
      }

      // 4. Sort alphabetically
      entries.sort();

      // 5. Format output
      const displayPath = args.path ?? workingDirectory;
      const hitLimit = entries.length >= MAX_RESULTS;
      const policyNote = skippedByPolicy
        ? `\n${skippedByFileAccessPolicyMessage}`
        : '';

      if (entries.length === 0 && timedOut) {
        const message = `No files found matching "${args.pattern}" in ${displayPath} (search timed out after 30s).${policyNote}`;
        return {
          data: {
            message,
          },
          content: message,
          status: 'failure',
        };
      }

      if (entries.length === 0) {
        const data: FindFilesResult = {
          pattern: args.pattern,
          basePath: displayPath,
          files: [],
          truncated: false,
        };
        return {
          data,
          content: `No files found matching "${args.pattern}" in ${displayPath}.${policyNote}`,
          status: 'success',
        };
      }

      const body = entries.join('\n');

      if (timedOut) {
        const header = `Found ${entries.length} files matching "${args.pattern}" in ${displayPath} (search timed out after 30s):`;
        return {
          data: {
            message: `${header} Results may be incomplete. Use a more specific pattern to narrow down.${policyNote}`,
          },
          content: `${header}\n${body}\nResults may be incomplete. Use a more specific pattern to narrow down.${policyNote}`,
          status: 'failure',
        };
      }

      if (hitLimit) {
        const header = `Found ${MAX_RESULTS}+ files matching "${args.pattern}" in ${displayPath} (showing first ${MAX_RESULTS}):`;
        const data: FindFilesResult = {
          pattern: args.pattern,
          basePath: displayPath,
          files: entries,
          truncated: true,
        };
        return {
          data,
          content: `${header}\n${body}\nUse a more specific pattern to narrow down.${policyNote}`,
          status: 'success',
        };
      }

      const header = `Found ${entries.length} files matching "${args.pattern}" in ${displayPath}:`;
      const data: FindFilesResult = {
        pattern: args.pattern,
        basePath: displayPath,
        files: entries,
        truncated: false,
      };
      return {
        data,
        content: `${header}\n${body}${policyNote}`,
        status: 'success',
      };
    },
  };
