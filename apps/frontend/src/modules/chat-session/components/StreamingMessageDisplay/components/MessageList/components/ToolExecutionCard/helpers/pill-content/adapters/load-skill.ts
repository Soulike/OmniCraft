import {loadSkillParametersSchema} from '@omnicraft/tool-schemas';

import type {ToolExecutionPillContent} from '../types.js';

export function loadSkillToolPillContent(
  parsed: unknown,
): ToolExecutionPillContent {
  const d = loadSkillParametersSchema.parse(parsed);

  return {target: d.name, targetKind: 'text', detail: null};
}
