import {askUserParametersSchema} from '@omnicraft/tool-schemas';
import {useMemo} from 'react';

import type {Question} from '../types.js';

/** Parses and validates the tool arguments JSON into a Question array. */
export function useQuestions(toolArguments: string): Question[] {
  return useMemo(() => {
    try {
      const parsed: unknown = JSON.parse(toolArguments);
      const result = askUserParametersSchema.safeParse(parsed);
      return result.success ? result.data.questions : [];
    } catch {
      return [];
    }
  }, [toolArguments]);
}
