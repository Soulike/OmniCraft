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
    .describe('Start line number (1-based), defaults to 1'),
  lineCount: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Number of lines to read, defaults to end of file'),
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
      'Replace all occurrences. Defaults to false (requires unique match)',
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
      'Search root directory (relative or absolute), defaults to working directory',
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
      'Search root directory (relative or absolute), defaults to working directory',
    ),
  filePattern: z
    .string()
    .optional()
    .describe(
      'Glob pattern to filter files, e.g. "**/*.ts", defaults to "**/*"',
    ),
});

// --- run_command ---

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_TIMEOUT_MS = 600_000;

export const runCommandParametersSchema = z.object({
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

// --- web_search ---

export const webSearchParametersSchema = z.object({
  query: z.string().describe('Search keywords.'),
  maxResults: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe('Number of results to return. Defaults to 5.'),
  includeDomains: z
    .array(z.string())
    .optional()
    .describe('Only search these domains.'),
  excludeDomains: z
    .array(z.string())
    .optional()
    .describe('Exclude these domains from results.'),
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
            'Predefined answer options. Empty array for free-text only.',
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
