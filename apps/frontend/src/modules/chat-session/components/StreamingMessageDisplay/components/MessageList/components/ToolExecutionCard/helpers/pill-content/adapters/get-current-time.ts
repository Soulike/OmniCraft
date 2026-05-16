import {z} from 'zod';

import type {ToolExecutionPillContent} from '../types.js';

const getCurrentTimeParametersSchema = z.object({});

export function getCurrentTimeToolPillContent(
  parsed: unknown,
): ToolExecutionPillContent {
  getCurrentTimeParametersSchema.parse(parsed);

  return {target: 'current time', targetKind: 'text'};
}
