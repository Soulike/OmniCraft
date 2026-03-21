import {toast} from '@heroui/react';
import {type ReactNode, useCallback, useEffect, useState} from 'react';
import type {ZodType} from 'zod';

import {getSettingValue, putSettingValue} from '@/api/settings/index.js';

import {SettingSectionView} from './SettingSectionView.js';
import type {SettingFieldValues, SettingSectionRenderProps} from './types.js';

interface FieldConfig {
  path: string;
  schema: ZodType;
}

interface SettingSectionProps {
  title: string;
  fields: FieldConfig[];
  children: (props: SettingSectionRenderProps) => ReactNode;
}

export function SettingSection({title, fields, children}: SettingSectionProps) {
  const [values, setValues] = useState<SettingFieldValues>({});
  const [validationErrors, setValidationErrors] = useState<
    Record<string, string>
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      const results = await Promise.all(
        fields.map(async ({path}) => {
          const value = await getSettingValue(path);
          return [path, value] as const;
        }),
      );
      setValues(Object.fromEntries(results));
      setIsLoading(false);
    };
    void load();
  }, [fields]);

  const setValue = useCallback((fieldPath: string, value: unknown) => {
    setValues((prev) => ({...prev, [fieldPath]: value}));
    setValidationErrors((prev) =>
      Object.fromEntries(
        Object.entries(prev).filter(([key]) => key !== fieldPath),
      ),
    );
  }, []);

  const handleSave = useCallback(async () => {
    const validationErrors: Record<string, string> = {};
    for (const {path, schema} of fields) {
      const result = schema.safeParse(values[path]);
      if (!result.success) {
        validationErrors[path] = result.error.issues[0].message;
      }
    }

    if (Object.keys(validationErrors).length > 0) {
      setValidationErrors(validationErrors);
      toast.danger('Please fix the errors before saving');
      return;
    }

    setIsSaving(true);
    try {
      await Promise.all(
        fields.map(({path}) => putSettingValue(path, values[path])),
      );
      toast.success('Settings saved');
    } catch {
      toast.danger('Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  }, [fields, values]);

  const isDisabled = isLoading || isSaving;

  return (
    <SettingSectionView
      title={title}
      isLoading={isLoading}
      isSaving={isSaving}
      onSave={() => {
        void handleSave();
      }}
    >
      {children({values, setValue, validationErrors, isDisabled})}
    </SettingSectionView>
  );
}
