import {sseTodoItemSchema, sseTodoStatusSchema} from '@omnicraft/sse-events';
import {z} from 'zod';

// --- Shared types ---

/** Shared result schema — all four todo tools return the full list. */
export const todoResultSchema = z.object({
  items: z.array(sseTodoItemSchema),
});

export type TodoResult = z.infer<typeof todoResultSchema>;

// --- Parameter schemas ---

/** A todo title: short, single-line. The single-line constraint keeps an
 *  attacker-influenced subject from injecting a newline that surfaces as
 *  apparent system guidance when the title is later embedded in a
 *  `<system-reminder>` stop-check block. */
const todoSubjectSchema = z
  .string()
  .min(1)
  .max(200)
  .refine((value) => !/[\r\n]/.test(value), {
    message: 'Subject must be a single line (no line breaks).',
  });

export const todoAppendParametersSchema = z.object({
  items: z
    .array(
      z.object({
        subject: todoSubjectSchema.describe('Brief title for the todo item'),
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
      'New title for the item. ' +
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
