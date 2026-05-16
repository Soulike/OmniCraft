import {runCommandParametersSchema} from '@omnicraft/tool-schemas';

import type {ToolExecutionPillContent} from '../types.js';

export function runCommandToolPillContent(
  parsed: unknown,
): ToolExecutionPillContent {
  const d = runCommandParametersSchema.parse(parsed);

  return {
    target: d.command,
    targetKind: 'code',
    detail: d.timeout === undefined ? null : `${d.timeout / 1000}s timeout`,
  };
}
