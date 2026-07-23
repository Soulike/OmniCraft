import {z} from 'zod';

// --- read_file ---

export const readFileParametersSchema = z.object({
  filePath: z
    .string()
    .describe('File path, absolute or relative to working directory'),
  startLine: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      'Start line number (1-based), defaults to 1. ' +
        'Use this to resume reading from a specific line after a previous partial read, ' +
        'or to jump directly to a known region of interest. ' +
        'Applies to text reads only; ignored when the file is an image or PDF.',
    ),
  lineCount: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      'Number of lines to read from startLine, defaults to end of file. ' +
        'Use this to read a specific portion of a large file ' +
        'when you only need a particular section rather than the entire content. ' +
        'Applies to text reads only; ignored when the file is an image or PDF.',
    ),
});

// --- write_file ---

export const writeFileParametersSchema = z.object({
  filePath: z
    .string()
    .min(1)
    .describe('File path, absolute or relative to working directory'),
  content: z.string().describe('File content to write'),
});

// --- edit_file ---

export const editFileParametersSchema = z.object({
  filePath: z
    .string()
    .min(1)
    .describe('File path, absolute or relative to working directory'),
  oldString: z.string().min(1).describe('The exact string to find and replace'),
  newString: z.string().describe('The replacement string'),
  replaceAll: z
    .boolean()
    .optional()
    .describe(
      'Replace all occurrences. Defaults to false (requires unique match). ' +
        'Set to true when the same string appears multiple times in the file ' +
        'and all occurrences should be replaced.',
    ),
});

// --- find_files ---

export const findFilesParametersSchema = z.object({
  pattern: z
    .string()
    .min(1)
    .describe(
      'Glob pattern to match files, e.g. "**/*.ts", "src/{components,hooks}/**/*.ts"',
    ),
  path: z
    .string()
    .optional()
    .describe(
      'Search root directory (relative or absolute), defaults to working directory. ' +
        'Use this to narrow the search to a specific subdirectory ' +
        'when you know which part of the project to look in.',
    ),
});

// --- search_files ---

export const searchFilesParametersSchema = z.object({
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
      'Search root directory (relative or absolute), defaults to working directory. ' +
        'Use this to limit the search scope to a specific subdirectory ' +
        'for faster results or to avoid matches in irrelevant areas.',
    ),
  filePattern: z
    .string()
    .optional()
    .describe(
      'Glob pattern to filter which files are searched, e.g. "**/*.ts", defaults to "**/*". ' +
        'Use this to restrict the search to specific file types ' +
        'when you only care about matches in certain languages or file formats.',
    ),
});

// --- run_command ---

export const RUN_COMMAND_DEFAULT_TIMEOUT_MS = 120_000;
export const RUN_COMMAND_MAX_TIMEOUT_MS = 600_000;

export const runCommandParametersSchema = z.object({
  command: z.string().min(1).describe('The shell command to execute'),
  timeout: z
    .number()
    .int()
    .min(1)
    .max(RUN_COMMAND_MAX_TIMEOUT_MS)
    .optional()
    .describe(
      `Timeout in milliseconds (default: ${RUN_COMMAND_DEFAULT_TIMEOUT_MS}, max: ${RUN_COMMAND_MAX_TIMEOUT_MS}). ` +
        'Increase this for long-running commands ' +
        'that are expected to exceed the default 2-minute limit.',
    ),
});

// --- web_search ---

export const webSearchParametersSchema = z.object({
  query: z
    .string()
    .describe(
      'Search keywords or phrase describing the information to find on the web.',
    ),
  maxResults: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe(
      'Number of results to return. Defaults to 5. ' +
        'Increase this when you need a broader survey of sources ' +
        'or when the first few results are unlikely to contain the answer.',
    ),
  includeDomains: z
    .array(z.string())
    .optional()
    .describe(
      'Only search these domains. ' +
        'Use this when you want results exclusively from specific sites.',
    ),
  excludeDomains: z
    .array(z.string())
    .optional()
    .describe(
      'Exclude these domains from results. ' +
        'Use this to filter out known low-quality or irrelevant sites ' +
        'that tend to dominate results for the query.',
    ),
  timeRange: z
    .enum(['day', 'week', 'month', 'year'])
    .optional()
    .describe(
      'Only return results published within this time range from now. ' +
        'Use when searching for recent events, news, or time-sensitive information.',
    ),
});

// --- web_fetch ---

export const webFetchParametersSchema = z.object({
  url: z.url().describe('The URL to fetch.'),
  includeFullPage: z
    .boolean()
    .optional()
    .describe(
      'Defaults to false. When false, only the main article content is extracted. ' +
        'Set to true to include the full page content if extraction is incomplete or missing information.',
    ),
});

// --- web_fetch_raw ---

export const webFetchRawParametersSchema = z.object({
  url: z.url().describe('The URL to fetch.'),
});

// --- load_skill ---

export const loadSkillParametersSchema = z.object({
  name: z.string().describe('Name of the skill to load'),
});

// --- ask_user ---

export const askUserParametersSchema = z.object({
  questions: z
    .array(
      z.object({
        question: z
          .string()
          .describe('The question text to display to the user'),
        options: z
          .array(z.string())
          .describe(
            'Predefined answer options for the user to select from. ' +
              'Provide options when there is a known set of valid choices to guide the user. ' +
              'Use an empty array for open-ended questions that require free-text input.',
          ),
      }),
    )
    .describe('One or more questions to present to the user'),
});

export const askUserBridgeResponseSchema = z.discriminatedUnion('cancelled', [
  z.object({
    cancelled: z.literal(false),
    answers: z.array(
      z.object({
        question: z.string(),
        answer: z.string().nullable(),
      }),
    ),
  }),
  z.object({cancelled: z.literal(true)}),
]);

export type AskUserBridgeResponse = z.infer<typeof askUserBridgeResponseSchema>;
