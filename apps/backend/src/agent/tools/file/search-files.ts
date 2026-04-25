import assert from 'node:assert';
import type {Stats} from 'node:fs';
import {createReadStream} from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';

import {
  searchFilesParametersSchema,
  searchFilesResultSchema,
  TOOL_NAME,
} from '@omnicraft/tool-schemas';
import fg from 'fast-glob';
import isSafeRegex from 'safe-regex2';
import {z} from 'zod';

import type {
  ToolDefinition,
  ToolExecutionContext,
} from '@/agent-core/tool/index.js';

import {
  checkExistingFileAccess,
  checkLexicalFileAccess,
  isPathThroughSymbolicLink,
} from './file-access-policy.js';
import {
  formatBlockedFileAccessMessage,
  skippedByFileAccessPolicyMessage,
} from './file-access-policy-messages.js';
import {isBinaryFile} from './helpers.js';

const MAX_MATCHES = 100;
const MAX_CONCURRENCY = 10;
const TIMEOUT_MS = 30_000;

/** A single matching line from a file search. */
export interface FileMatch {
  readonly line: number;
  readonly content: string;
}

/** A group of matches from a single file. */
interface FileSearchResult {
  readonly filePath: string;
  readonly matches: readonly FileMatch[];
}

/**
 * Searches a single file line-by-line for regex matches.
 * Stops when maxMatches is reached or the AbortSignal fires.
 */
export async function searchFile(
  absolutePath: string,
  regex: RegExp,
  maxMatches: number,
  signal?: AbortSignal,
): Promise<FileMatch[]> {
  const matches: FileMatch[] = [];

  const rl = readline.createInterface({
    input: createReadStream(absolutePath, {encoding: 'utf-8'}),
    crlfDelay: Infinity,
  });

  try {
    let lineNumber = 0;
    for await (const line of rl) {
      if (signal?.aborted) break;
      lineNumber++;
      if (regex.test(line)) {
        matches.push({line: lineNumber, content: line});
        if (matches.length >= maxMatches) break;
      }
    }
  } finally {
    rl.close();
  }

  return matches;
}

const parameters = searchFilesParametersSchema;

type SearchFilesArgs = z.infer<typeof parameters>;
type SearchFilesResult = z.infer<typeof searchFilesResultSchema>;

/** Built-in tool that searches file contents for a regex pattern. */
export const searchFilesTool: ToolDefinition<
  typeof parameters,
  SearchFilesResult
> = {
  name: TOOL_NAME.SEARCH_FILES,
  displayName: 'Search Files',
  description:
    'Searches file contents for a regex pattern and returns matching lines with file paths and line numbers. ' +
    'Use this to find where a specific string or pattern appears across files. ' +
    'Symlinked directories and files are not traversed or searched. ' +
    'If expected matches are missing, review whether the files are behind a symlink; ' +
    'do not attempt to bypass file access policy.',
  parameters,
  suppressToolEvents: false,
  async execute(args: SearchFilesArgs, context: ToolExecutionContext) {
    const {workingDirectory} = context;

    // 1. Resolve search directory
    const searchDir = path.resolve(workingDirectory, args.path ?? '.');

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
    if (
      !rootPolicy.allowed ||
      (await isPathThroughSymbolicLink(workingDirectory, searchDir))
    ) {
      const message = formatBlockedFileAccessMessage(args.path ?? searchDir);
      return {
        data: {message},
        content: message,
        status: 'failure',
      };
    }

    // 3. Compile regex
    if (!isSafeRegex(args.pattern)) {
      return {
        data: {
          message:
            'Regex pattern rejected — potential catastrophic backtracking',
        },
        content:
          'Error: Regex pattern rejected — potential catastrophic backtracking',
        status: 'failure',
      };
    }

    let regex: RegExp;
    try {
      regex = new RegExp(args.pattern);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        data: {message: `Invalid regex pattern: ${message}`},
        content: `Error: Invalid regex pattern: ${message}`,
        status: 'failure',
      };
    }

    // 4. Enumerate files and search concurrently
    const stream = fg.stream(args.filePattern ?? '**/*', {
      cwd: searchDir,
      onlyFiles: false,
      dot: true,
      followSymbolicLinks: false,
    });

    const results: FileSearchResult[] = [];
    let totalMatches = 0;
    let timedOut = false;
    let skippedByPolicy = false;
    const startTime = Date.now();
    const controller = new AbortController();

    const inFlight = new Set<Promise<void>>();

    try {
      for await (const entry of stream) {
        if (totalMatches >= MAX_MATCHES) break;
        if (Date.now() - startTime > TIMEOUT_MS) {
          timedOut = true;
          break;
        }

        assert(typeof entry === 'string');
        const absolutePath = path.join(searchDir, entry);
        const entryPolicy = checkLexicalFileAccess(absolutePath);
        if (
          !entryPolicy.allowed ||
          (await isPathThroughSymbolicLink(workingDirectory, absolutePath))
        ) {
          skippedByPolicy = true;
          continue;
        }

        const realEntryPolicy = await checkExistingFileAccess(absolutePath);
        if (!realEntryPolicy.allowed) {
          skippedByPolicy = true;
          continue;
        }

        let entryStat: Stats;
        try {
          entryStat = await fs.stat(absolutePath);
        } catch {
          continue;
        }

        if (!entryStat.isFile()) {
          continue;
        }

        const relativePath = entry;

        const task = (async () => {
          try {
            if (await isBinaryFile(absolutePath)) return;
          } catch {
            return;
          }

          const remaining = MAX_MATCHES - totalMatches;
          if (remaining <= 0) return;

          const matches = await searchFile(
            absolutePath,
            regex,
            remaining,
            controller.signal,
          );

          if (matches.length > 0) {
            results.push({filePath: relativePath, matches});
            totalMatches += matches.length;
            if (totalMatches >= MAX_MATCHES) {
              controller.abort();
            }
          }
        })();

        inFlight.add(task);
        void task.finally(() => inFlight.delete(task));

        while (inFlight.size >= MAX_CONCURRENCY) {
          await Promise.race(inFlight);
        }
      }
    } catch (error: unknown) {
      if (totalMatches === 0) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          data: {message},
          content: `Error: ${message}`,
          status: 'failure',
        };
      }
    }

    // Wait for remaining in-flight searches
    await Promise.allSettled(inFlight);

    // Check timeout after waiting
    if (!timedOut && Date.now() - startTime > TIMEOUT_MS) {
      timedOut = true;
    }

    // 5. Sort by file path, then line number
    results.sort((a, b) => a.filePath.localeCompare(b.filePath));

    // 6. Format output
    const displayPath = args.path ?? workingDirectory;
    const hitLimit = totalMatches >= MAX_MATCHES;
    const policyNote = skippedByPolicy
      ? `\n${skippedByFileAccessPolicyMessage}`
      : '';

    // Build flat matches for structured data
    const flatMatches = results.flatMap((r) =>
      r.matches.map((m) => ({
        file: r.filePath,
        line: m.line,
        content: m.content,
      })),
    );

    if (totalMatches === 0 && timedOut) {
      const message = `No matches found for /${args.pattern}/ in ${displayPath} (search timed out after 30s).${policyNote}`;
      return {
        data: {
          message,
        },
        content: message,
        status: 'failure',
      };
    }

    if (totalMatches === 0) {
      const data: SearchFilesResult = {
        pattern: args.pattern,
        basePath: displayPath,
        matches: [],
        truncated: false,
      };
      const content = skippedByPolicy
        ? `No matches found in ${displayPath}.${policyNote}`
        : `No matches found for /${args.pattern}/ in ${displayPath}.`;
      return {
        data,
        content,
        status: 'success',
      };
    }

    const lines: string[] = [];
    let count = 0;
    for (const result of results) {
      for (const match of result.matches) {
        if (count >= MAX_MATCHES) break;
        lines.push(`${result.filePath}:${match.line}: ${match.content}`);
        count++;
      }
      if (count >= MAX_MATCHES) break;
    }

    const body = lines.join('\n');

    if (timedOut) {
      const header = `Found ${count} matches for /${args.pattern}/ in ${displayPath} (search timed out after 30s):`;
      return {
        data: {
          message: `${header} Results may be incomplete. Use a more specific pattern to narrow down.${policyNote}`,
        },
        content: `${header}\n${body}\nResults may be incomplete. Use a more specific pattern to narrow down.${policyNote}`,
        status: 'failure',
      };
    }

    if (hitLimit) {
      const header = `Found ${MAX_MATCHES}+ matches for /${args.pattern}/ in ${displayPath} (showing first ${MAX_MATCHES}):`;
      const data: SearchFilesResult = {
        pattern: args.pattern,
        basePath: displayPath,
        matches: flatMatches.slice(0, MAX_MATCHES),
        truncated: true,
      };
      return {
        data,
        content: `${header}\n${body}\nUse a more specific pattern to narrow down.${policyNote}`,
        status: 'success',
      };
    }

    const header = `Found ${count} matches for /${args.pattern}/ in ${displayPath}:`;
    const data: SearchFilesResult = {
      pattern: args.pattern,
      basePath: displayPath,
      matches: flatMatches,
      truncated: false,
    };
    return {
      data,
      content: `${header}\n${body}${policyNote}`,
      status: 'success',
    };
  },
};
