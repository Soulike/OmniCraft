import type {askUserParametersSchema} from '@omnicraft/tool-schemas';
import type {z} from 'zod';

export type Question = z.infer<
  typeof askUserParametersSchema
>['questions'][number];

export interface AnswerEntry {
  question: string;
  answer: string | null;
}

/** Sentinel value for the "Other" radio option in the questionnaire. */
export const OTHER_VALUE = '__other__';
