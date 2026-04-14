import {z} from 'zod';

/** Schema for the GET /vscode/status response body. */
export const getVscodeStatusResponseSchema = z.object({
  available: z.boolean(),
  port: z.number(),
  connectionToken: z.string(),
});

export type GetVscodeStatusResponse = z.infer<
  typeof getVscodeStatusResponseSchema
>;
