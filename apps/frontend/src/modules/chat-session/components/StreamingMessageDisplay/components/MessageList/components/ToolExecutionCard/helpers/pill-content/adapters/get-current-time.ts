import type {ToolExecutionPillContent} from '../types.js';

export function getCurrentTimeToolPillContent(): ToolExecutionPillContent {
  return {target: 'current time', targetKind: 'text', detail: null};
}
