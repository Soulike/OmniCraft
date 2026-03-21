import {z} from 'zod';

export const getValueResponse = z.object({
  value: z.unknown(),
});

export const putValueResponse = z.object({
  success: z.boolean(),
});
