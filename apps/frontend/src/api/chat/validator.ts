import {z} from 'zod';

export {sseEventSchema} from '@omnicraft/sse-events';

/** Validates the response from POST /api/chat/session. */
export const createSessionResponse = z.object({
  sessionId: z.string(),
});

/** Validates the response from POST /api/chat/session/:id/generate-title. */
export const generateTitleResponse = z.object({
  title: z.string(),
});
