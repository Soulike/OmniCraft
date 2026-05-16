import {readFileParametersSchema} from '@omnicraft/tool-schemas';

import {getDisplayFileName} from '@/helpers/get-display-file-name.js';

import type {ToolExecutionPillContent} from '../types.js';

export function readFileToolPillContent(
  parsed: unknown,
): ToolExecutionPillContent {
  const d = readFileParametersSchema.parse(parsed);

  return {
    target: getDisplayFileName(d.filePath),
    targetKind: 'code',
  };
}
