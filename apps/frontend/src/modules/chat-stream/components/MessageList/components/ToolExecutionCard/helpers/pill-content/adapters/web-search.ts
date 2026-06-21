import {webSearchParametersSchema} from '@omnicraft/tool-schemas';

import type {ToolExecutionPillContent} from '../types.js';

export function webSearchToolPillContent(
  parsed: unknown,
): ToolExecutionPillContent {
  const d = webSearchParametersSchema.parse(parsed);

  return {
    target: d.query,
    targetKind: 'text',
  };
}
