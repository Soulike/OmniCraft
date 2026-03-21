import type {ZodType} from 'zod';

export type SettingFieldValues = Record<string, unknown>;

export interface FieldConfig {
  path: string;
  schema: ZodType;
}

export interface SettingSectionRenderProps {
  values: SettingFieldValues;
  setValue: (fieldPath: string, value: unknown) => void;
  validationErrors: Record<string, string>;
  isDisabled: boolean;
}
