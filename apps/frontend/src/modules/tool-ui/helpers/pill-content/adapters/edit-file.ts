import {editFileParametersSchema} from '@omnicraft/tool-schemas';

import {getDisplayFileName} from '@/helpers/get-display-file-name.js';

import type {ToolExecutionPillContent} from '../types.js';

export function editFileToolPillContent(
  parsed: unknown,
): ToolExecutionPillContent {
  const d = editFileParametersSchema.parse(parsed);

  return {
    target: getDisplayFileName(d.filePath),
    targetKind: 'code',
  };
}
