import {askUserParametersSchema} from '@omnicraft/tool-schemas';
import {useMemo} from 'react';

import type {AskUserQuestion} from '@/modules/chat-ui-components/index.js';

/** Parses and validates the tool arguments JSON into presentation questions. */
export function useQuestions(toolArguments: string): AskUserQuestion[] {
  return useMemo(() => {
    try {
      const parsed: unknown = JSON.parse(toolArguments);
      const result = askUserParametersSchema.safeParse(parsed);
      if (!result.success) return [];
      return result.data.questions.map((question) => ({
        question: question.question,
        options: question.options,
      }));
    } catch {
      return [];
    }
  }, [toolArguments]);
}
