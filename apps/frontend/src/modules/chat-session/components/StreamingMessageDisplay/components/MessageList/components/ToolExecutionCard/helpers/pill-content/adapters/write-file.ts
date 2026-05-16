import {writeFileParametersSchema} from '@omnicraft/tool-schemas';

import type {ToolExecutionPillContent} from '../types.js';

export function writeFileToolPillContent(
  parsed: unknown,
): ToolExecutionPillContent {
  const d = writeFileParametersSchema.parse(parsed);

  return {target: d.filePath, targetKind: 'code'};
}
