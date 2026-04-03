import {z} from 'zod';

/** Schema for the POST /chat/session/:id/completions request body. */
export const chatCompletionsBody = z.object({
  message: z.string().min(1),
});

/** Schema for the POST /chat/session/:id/generate-title request body. */
export const generateTitleBody = z.object({
  userMessage: z.string().min(1),
  assistantMessage: z.string().min(1),
});
