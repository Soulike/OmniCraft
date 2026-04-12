import type {askUserParametersSchema} from '@omnicraft/tool-schemas';
import type {z} from 'zod';

export type Question = z.infer<
  typeof askUserParametersSchema
>['questions'][number];

export interface AnswerEntry {
  question: string;
  answer: string | null;
}
