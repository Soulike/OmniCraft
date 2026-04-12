import {z} from 'zod';

export const askUserParametersSchema = z.object({
  questions: z
    .array(
      z.object({
        question: z
          .string()
          .describe('The question text to display to the user'),
        options: z
          .array(z.string())
          .describe(
            'Predefined answer options. Empty array for free-text only.',
          ),
      }),
    )
    .describe('One or more questions to present to the user'),
});

export const askUserBridgeResponseSchema = z.discriminatedUnion('cancelled', [
  z.object({
    cancelled: z.literal(false),
    answers: z.array(
      z.object({
        question: z.string(),
        answer: z.string().nullable(),
      }),
    ),
  }),
  z.object({cancelled: z.literal(true)}),
]);
