import {searchFilesParametersSchema} from '@omnicraft/tool-schemas';

import type {ToolExecutionPillContent} from '../types.js';

export function searchFilesToolPillContent(
  parsed: unknown,
): ToolExecutionPillContent {
  const d = searchFilesParametersSchema.parse(parsed);

  return {
    target: d.pattern,
    targetKind: 'code',
  };
}
