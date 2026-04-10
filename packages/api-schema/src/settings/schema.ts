import {z} from 'zod';

/** A scalar setting value for the generic settings API. Non-scalar leaves (e.g. arrays) use dedicated endpoints. */
export const settingValueSchema = z
  .unknown()
  .refine((v) => typeof v !== 'object' || v === null, {
    message: 'Value must be a scalar, not an object',
  });

export type SettingValue = z.infer<typeof settingValueSchema>;

/** Schema for the GET /settings/* response body. */
export const getSettingValueResponseSchema = z.object({
  value: z.unknown(),
});

export type GetSettingValueResponse = z.infer<
  typeof getSettingValueResponseSchema
>;

/** Schema for the PUT /settings/* request body. */
export const putSettingValueRequestSchema = z.object({
  value: settingValueSchema,
});

export type PutSettingValueRequest = z.infer<
  typeof putSettingValueRequestSchema
>;

/** Schema for the PUT /settings/* response body. */
export const putSettingValueResponseSchema = z.object({
  success: z.boolean(),
});

export type PutSettingValueResponse = z.infer<
  typeof putSettingValueResponseSchema
>;

/** Schema for the PUT /settings/batch request body. */
export const putSettingsBatchRequestSchema = z.object({
  entries: z
    .array(
      z.object({
        path: z.string().min(1),
        value: settingValueSchema,
      }),
    )
    .nonempty(),
});

export type PutSettingsBatchRequest = z.infer<
  typeof putSettingsBatchRequestSchema
>;

/** Schema for the PUT /settings/batch response body. */
export const putSettingsBatchResponseSchema = z.object({
  success: z.boolean(),
});

export type PutSettingsBatchResponse = z.infer<
  typeof putSettingsBatchResponseSchema
>;
