import type {ToolName} from '@omnicraft/tool-schemas';

import type {ToolExecutionPillContent} from './types.js';

interface FallbackToolPillContentInput {
  toolName: ToolName;
}

export function fallbackToolPillContent({
  toolName,
}: FallbackToolPillContentInput): ToolExecutionPillContent {
  return {target: toolName, targetKind: 'code'};
}
