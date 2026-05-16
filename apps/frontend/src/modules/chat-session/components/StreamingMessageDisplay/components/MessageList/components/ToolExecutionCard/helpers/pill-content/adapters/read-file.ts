import {readFileParametersSchema} from '@omnicraft/tool-schemas';

import type {ToolExecutionPillContent} from '../types.js';

export function readFileToolPillContent(
  parsed: unknown,
): ToolExecutionPillContent {
  const d = readFileParametersSchema.parse(parsed);

  return {
    target: d.filePath,
    targetKind: 'code',
    detail: getReadFileLineDetail(d.startLine, d.lineCount),
  };
}

function getReadFileLineDetail(
  startLine: number | undefined,
  lineCount: number | undefined,
): string | null {
  if (startLine === undefined && lineCount === undefined) {
    return null;
  }

  if (startLine === undefined) {
    return `${lineCount} lines`;
  }

  if (lineCount === undefined) {
    return `from line ${startLine}`;
  }

  return `lines ${startLine}-${startLine + lineCount - 1}`;
}
