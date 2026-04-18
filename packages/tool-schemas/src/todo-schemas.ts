import {z} from 'zod';

// --- Shared types ---

const todoStatusSchema = z.enum(['pending', 'in_progress', 'completed']);

export const todoItemSchema = z.object({
  index: z.number().int().min(0),
  subject: z.string(),
  description: z.string(),
  status: todoStatusSchema,
});

/** Shared result schema — all four todo tools return the full list. */
export const todoResultSchema = z.object({
  items: z.array(todoItemSchema),
});

// --- Parameter schemas ---

export const todoAppendParametersSchema = z.object({
  subject: z.string().min(1).describe('Brief title for the todo item'),
  description: z.string().describe('What needs to be done'),
});

export const todoUpdateParametersSchema = z.object({
  index: z
    .number()
    .int()
    .min(0)
    .describe(
      'The 0-based index of the todo item to update, as shown in the todo list',
    ),
  subject: z
    .string()
    .min(1)
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
  status: todoStatusSchema
    .optional()
    .describe(
      'New status for the item. ' +
        'Set to in_progress when starting work, completed when done.',
    ),
});

export const todoClearParametersSchema = z.object({});

export const todoListParametersSchema = z.object({});
