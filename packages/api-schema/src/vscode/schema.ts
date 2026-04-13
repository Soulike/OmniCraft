import {z} from 'zod';

/** Schema for the GET /vscode/status response body. */
export const getVscodeStatusResponseSchema = z.object({
  available: z.boolean(),
});

export type GetVscodeStatusResponse = z.infer<
  typeof getVscodeStatusResponseSchema
>;
