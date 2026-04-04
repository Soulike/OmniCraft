import assert from 'node:assert';
import type {Stats} from 'node:fs';
import {createReadStream} from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';

import fg from 'fast-glob';
import isSafeRegex from 'safe-regex2';
import {z} from 'zod';

import type {
  ToolDefinition,
  ToolExecutionContext,
} from '@/agent-core/tool/index.js';

import {isBinaryFile, isSubPathOrSelf} from './helpers.js';

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

const parameters = z.object({
  pattern: z
    .string()
    .min(1)
    .describe(
      'Pattern string compiled to a JavaScript RegExp and matched with .test() per line',
    ),
  path: z
    .string()
    .optional()
    .describe(
      'Search root directory (relative or absolute), defaults to working directory',
    ),
  filePattern: z
    .string()
    .optional()
    .describe(
      'Glob pattern to filter files, e.g. "**/*.ts", defaults to "**/*"',
    ),
});

type SearchFilesArgs = z.infer<typeof parameters>;

/** Built-in tool that searches file contents for a regex pattern. */
export const searchFilesTool: ToolDefinition<typeof parameters> = {
  name: 'search_files',
  displayName: 'Search Files',
  description:
    'Searches file contents for a regex pattern and returns matching lines.',
  parameters,
  async execute(
    args: SearchFilesArgs,
    context: ToolExecutionContext,
  ): Promise<string> {
    const {workingDirectory} = context;

    // 1. Resolve search directory
    const searchDir = path.resolve(workingDirectory, args.path ?? '.');

    // 2. Security check
    if (!isSubPathOrSelf(workingDirectory, searchDir)) {
      const allowed = context.extraAllowedPaths.some((entry) =>
        isSubPathOrSelf(entry.path, searchDir),
      );
      if (!allowed) {
        return 'Error: Access denied: path is outside the allowed directories';
      }
    }

    // 3. Verify directory exists
    let stat: Stats;
    try {
      stat = await fs.stat(searchDir);
    } catch {
      return `Error: Directory not found: ${args.path}`;
    }

    if (!stat.isDirectory()) {
      return `Error: Not a directory: ${args.path}`;
    }

    // 4. Compile regex
    if (!isSafeRegex(args.pattern)) {
      return 'Error: Regex pattern rejected — potential catastrophic backtracking';
    }

    let regex: RegExp;
    try {
      regex = new RegExp(args.pattern);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return `Error: Invalid regex pattern: ${message}`;
    }

    // 5. Enumerate files and search concurrently
    const stream = fg.stream(args.filePattern ?? '**/*', {
      cwd: searchDir,
      onlyFiles: true,
      dot: true,
    });

    const results: FileSearchResult[] = [];
    let totalMatches = 0;
    let timedOut = false;
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
        return `Error: ${message}`;
      }
    }

    // Wait for remaining in-flight searches
    await Promise.allSettled(inFlight);

    // Check timeout after waiting
    if (!timedOut && Date.now() - startTime > TIMEOUT_MS) {
      timedOut = true;
    }

    // 6. Sort by file path, then line number
    results.sort((a, b) => a.filePath.localeCompare(b.filePath));

    // 7. Format output
    const displayPath = args.path ?? workingDirectory;
    const hitLimit = totalMatches >= MAX_MATCHES;

    if (totalMatches === 0 && timedOut) {
      return `No matches found for /${args.pattern}/ in ${displayPath} (search timed out after 30s).`;
    }

    if (totalMatches === 0) {
      return `No matches found for /${args.pattern}/ in ${displayPath}.`;
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
      return `${header}\n${body}\nResults may be incomplete. Use a more specific pattern to narrow down.`;
    }

    if (hitLimit) {
      const header = `Found ${MAX_MATCHES}+ matches for /${args.pattern}/ in ${displayPath} (showing first ${MAX_MATCHES}):`;
      return `${header}\n${body}\nUse a more specific pattern to narrow down.`;
    }

    const header = `Found ${count} matches for /${args.pattern}/ in ${displayPath}:`;
    return `${header}\n${body}`;
  },
};
