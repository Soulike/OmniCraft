import {webFetchRawParametersSchema} from '@omnicraft/tool-schemas';

import type {ToolExecutionPillContent} from '../types.js';

export function webFetchRawToolPillContent(
  parsed: unknown,
): ToolExecutionPillContent {
  const d = webFetchRawParametersSchema.parse(parsed);

  return {target: d.url, targetKind: 'code'};
}
