import type {ToolExecutionPillContent} from './types.js';

interface FallbackToolPillContentInput {
  toolName: string;
}

export function fallbackToolPillContent({
  toolName,
}: FallbackToolPillContentInput): ToolExecutionPillContent {
  return {target: toolName, targetKind: 'code'};
}
