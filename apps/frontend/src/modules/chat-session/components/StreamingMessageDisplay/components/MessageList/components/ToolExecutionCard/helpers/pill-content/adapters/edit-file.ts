import {editFileParametersSchema} from '@omnicraft/tool-schemas';

import type {ToolExecutionPillContent} from '../types.js';

export function editFileToolPillContent(
  parsed: unknown,
): ToolExecutionPillContent {
  const d = editFileParametersSchema.parse(parsed);

  return {
    target: d.filePath,
    targetKind: 'code',
    detail: d.replaceAll === true ? 'replace all' : null,
  };
}
