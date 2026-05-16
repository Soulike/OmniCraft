import {readFileParametersSchema} from '@omnicraft/tool-schemas';

import type {ToolExecutionPillContent} from '../types.js';

export function readFileToolPillContent(
  parsed: unknown,
): ToolExecutionPillContent {
  const d = readFileParametersSchema.parse(parsed);

  return {
    target: d.filePath,
    targetKind: 'code',
  };
}
