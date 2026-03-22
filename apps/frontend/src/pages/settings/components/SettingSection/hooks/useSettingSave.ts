import {toast} from '@heroui/react';
import {useCallback, useState} from 'react';

import {putSettingValues} from '@/api/settings/index.js';

import type {FieldConfig, SettingFieldValues} from '../types.js';

export function useSettingSave(fields: FieldConfig[]) {
  const [isSaving, setIsSaving] = useState(false);

  const save = useCallback(
    async (values: SettingFieldValues) => {
      setIsSaving(true);
      try {
        const entries = fields.map(({path}) => ({path, value: values[path]}));
        await putSettingValues(entries);
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
