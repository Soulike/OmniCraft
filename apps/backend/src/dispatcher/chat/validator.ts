import {z} from 'zod';

/** Schema for the POST /chat/session/:id/completions request body. */
export const chatCompletionsBody = z.object({
  message: z.string().min(1),
});
