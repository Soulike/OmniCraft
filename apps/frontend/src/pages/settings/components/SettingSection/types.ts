export type SettingFieldValues = Record<string, unknown>;

export interface SettingSectionRenderProps {
  values: SettingFieldValues;
  setValue: (fieldPath: string, value: unknown) => void;
  validationErrors: Record<string, string>;
  isDisabled: boolean;
}
