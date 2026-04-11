import {useMemo} from 'react';
import {z} from 'zod';

import {ReadFileResult} from '../ReadFileResult/index.js';

const writeFileArgsSchema = z.object({content: z.string()});

interface WriteFileResultProps {
  filePath: string;
  lineCount: number;
  arguments: string;
}

export function WriteFileResult({
  filePath,
  lineCount,
  arguments: toolArguments,
}: WriteFileResultProps) {
  const content = useMemo(() => extractContent(toolArguments), [toolArguments]);

  return (
    <ReadFileResult
      content={content}
      endLine={lineCount}
      filePath={filePath}
      startLine={1}
      totalLines={lineCount}
    />
  );
}

function extractContent(jsonString: string): string {
  try {
    const parsed: unknown = JSON.parse(jsonString);
    const result = writeFileArgsSchema.safeParse(parsed);
    if (result.success) {
      return result.data.content;
    }
    console.warn(
      'WriteFileResult: expected "content" field in arguments, falling back to raw display',
    );
    return jsonString;
  } catch {
    return jsonString;
  }
}
