import {useCallback, useEffect, useState} from 'react';

import {getSettingValue} from '@/api/settings/index.js';

import type {FieldConfig, SettingFieldValues} from '../types.js';

export function useSettingValues(fields: FieldConfig[]) {
  const [values, setValues] = useState<SettingFieldValues>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(false);
    try {
      const results = await Promise.all(
        fields.map(async ({path}) => {
          const value = await getSettingValue(path);
          return [path, value] as const;
        }),
      );
      setValues(Object.fromEntries(results));
    } catch {
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, [fields]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateValue = useCallback((fieldPath: string, value: unknown) => {
    setValues((prev) => ({...prev, [fieldPath]: value}));
  }, []);

  return {values, updateValue, isLoading, loadError, reload: load};
}
