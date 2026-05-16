import {findFilesParametersSchema} from '@omnicraft/tool-schemas';

import type {ToolExecutionPillContent} from '../types.js';

export function findFilesToolPillContent(
  parsed: unknown,
): ToolExecutionPillContent {
  const d = findFilesParametersSchema.parse(parsed);

  return {target: d.pattern, targetKind: 'code'};
}
