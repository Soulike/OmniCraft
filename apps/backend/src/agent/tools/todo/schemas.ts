import {sseTodoItemSchema, sseTodoStatusSchema} from '@omnicraft/sse-events';
import {z} from 'zod';

// --- Shared types ---

/** Shared result schema — all four todo tools return the full list. */
export const todoResultSchema = z.object({
  items: z.array(sseTodoItemSchema),
});

export type TodoResult = z.infer<typeof todoResultSchema>;

// --- Parameter schemas ---

const todoSubjectSchema = z.string().min(1).max(200);

const SUBJECT_DESCRIPTION =
  'Brief, single-line title for the todo item. ' +
  'Keep it to one line so the list renders cleanly; put any detail in the ' +
  'description instead.';

export const todoAppendParametersSchema = z.object({
  items: z
    .array(
      z.object({
        subject: todoSubjectSchema.describe(SUBJECT_DESCRIPTION),
        description: z.string().describe('What needs to be done'),
      }),
    )
    .min(1)
    .describe('Items to append to the todo list'),
});

export const todoUpdateParametersSchema = z.object({
  index: z
    .number()
    .int()
    .min(0)
    .describe(
      'The 0-based index of the todo item to update, as shown in the todo list',
    ),
  subject: todoSubjectSchema
    .optional()
    .describe(
      `New title for the item. ${SUBJECT_DESCRIPTION} ` +
        'Only provide this when the title needs to change.',
    ),
  description: z
    .string()
    .optional()
    .describe(
      'New description for the item. ' +
        'Only provide this when the description needs to change.',
    ),
  status: sseTodoStatusSchema
    .optional()
    .describe(
      'New status for the item. ' +
        'Set to in_progress when starting work, completed when done.',
    ),
});

export const todoClearParametersSchema = z.object({});

export const todoListParametersSchema = z.object({});
