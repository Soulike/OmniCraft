import {z} from 'zod';

export const workspaceSchema = z.object({
  path: z.string().describe('Absolute directory path'),
});

export type Workspace = z.infer<typeof workspaceSchema>;

export const fileAccessSettingsSchema = z.object({
  workspaces: z
    .array(workspaceSchema)
    .describe('Configured workspaces')
    .default([]),
});
