import {toast} from '@heroui/react';
import {useCallback, useState} from 'react';

import {putSettingValue} from '@/api/settings/index.js';

import type {FieldConfig, SettingFieldValues} from '../types.js';

export function useSettingSave(fields: FieldConfig[]) {
  const [isSaving, setIsSaving] = useState(false);

  const save = useCallback(
    async (values: SettingFieldValues) => {
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
    },
    [fields],
  );

  return {isSaving, save};
}
