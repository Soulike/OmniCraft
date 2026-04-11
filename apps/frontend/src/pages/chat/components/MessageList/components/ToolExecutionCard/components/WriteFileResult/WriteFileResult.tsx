import {useMemo} from 'react';

import {ReadFileResult} from '../ReadFileResult/index.js';

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
      content={content ?? toolArguments}
      endLine={lineCount}
      filePath={filePath}
      startLine={1}
      totalLines={lineCount}
    />
  );
}

function extractContent(jsonString: string): string | undefined {
  try {
    const parsed = JSON.parse(jsonString) as Record<string, unknown>;
    if (typeof parsed.content === 'string') {
      return parsed.content;
    }
    console.warn(
      'WriteFileResult: expected "content" field in arguments, falling back to raw display',
    );
    return undefined;
  } catch {
    return undefined;
  }
}
