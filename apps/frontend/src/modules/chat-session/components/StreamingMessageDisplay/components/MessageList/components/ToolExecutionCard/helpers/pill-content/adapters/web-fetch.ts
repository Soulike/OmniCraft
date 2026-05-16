import {webFetchParametersSchema} from '@omnicraft/tool-schemas';

import type {ToolExecutionPillContent} from '../types.js';

export function webFetchToolPillContent(
  parsed: unknown,
): ToolExecutionPillContent {
  const d = webFetchParametersSchema.parse(parsed);

  return {
    target: d.url,
    targetKind: 'code',
  };
}
