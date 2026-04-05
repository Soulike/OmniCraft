import {z} from 'zod';

export const accessModeSchema = z
  .enum(['read', 'read-write'])
  .describe('Access mode for the path');

export const allowedPathEntrySchema = z.object({
  path: z.string().describe('Absolute directory path'),
  mode: accessModeSchema,
});

export type AllowedPathEntry = z.infer<typeof allowedPathEntrySchema>;

export const fileAccessSettingsSchema = z.object({
  allowedPaths: z
    .array(allowedPathEntrySchema)
    .describe('User-configured accessible paths')
    .default([]),
});
