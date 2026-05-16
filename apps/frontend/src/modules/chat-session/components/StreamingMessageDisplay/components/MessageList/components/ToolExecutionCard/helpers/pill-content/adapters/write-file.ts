import {writeFileParametersSchema} from '@omnicraft/tool-schemas';

import {getDisplayFileName} from '@/helpers/get-display-file-name.js';

import type {ToolExecutionPillContent} from '../types.js';

export function writeFileToolPillContent(
  parsed: unknown,
): ToolExecutionPillContent {
  const d = writeFileParametersSchema.parse(parsed);

  return {target: getDisplayFileName(d.filePath), targetKind: 'code'};
}
