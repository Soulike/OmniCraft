import {z} from 'zod';

export const readFileResultSchema = z.object({
  filePath: z.string(),
  totalLines: z.number(),
  startLine: z.number(),
  endLine: z.number(),
  content: z.string(),
});

export const writeFileResultSchema = z.object({
  filePath: z.string(),
  lineCount: z.number(),
});

export const editFileResultSchema = z.object({
  filePath: z.string(),
  matchCount: z.number(),
  diff: z.string(),
  truncated: z.boolean(),
});

export const findFilesResultSchema = z.object({
  pattern: z.string(),
  basePath: z.string(),
  files: z.array(z.string()),
  truncated: z.boolean(),
});

export const searchFilesResultSchema = z.object({
  pattern: z.string(),
  basePath: z.string(),
  matches: z.array(
    z.object({
      file: z.string(),
      line: z.number(),
      content: z.string(),
    }),
  ),
  truncated: z.boolean(),
});

export const runCommandResultSchema = z.object({
  command: z.string(),
  exitCode: z.number(),
  timedOut: z.boolean(),
  cwd: z.string(),
  stdout: z.string(),
  stderr: z.string(),
});

export const getCurrentTimeResultSchema = z.object({
  iso: z.string(),
});

export const webFetchResultSchema = z.object({
  url: z.string(),
  title: z.string().optional(),
  content: z.string(),
});

export const webFetchRawResultSchema = z.object({
  url: z.string(),
  content: z.string(),
});

export const webSearchResultSchema = z.object({
  results: z.array(
    z.object({
      title: z.string(),
      url: z.string(),
      score: z.number(),
      content: z.string(),
    }),
  ),
});

export const loadSkillResultSchema = z.object({
  name: z.string(),
  content: z.string(),
});

/** Structured data for failure/error results. */
export const toolFailureDataSchema = z.object({message: z.string()});
