import {useCallback, useState} from 'react';

import type {FieldConfig, SettingFieldValues} from '../types.js';

export function useSettingValidation(fields: FieldConfig[]) {
  const [validationErrors, setValidationErrors] = useState<
    Record<string, string>
  >({});

  const validate = useCallback(
    (values: SettingFieldValues): boolean => {
      const errors: Record<string, string> = {};
      for (const {path, schema} of fields) {
        const result = schema.safeParse(values[path]);
        if (!result.success) {
          errors[path] = result.error.issues[0].message;
        }
      }
      setValidationErrors(errors);
      return Object.keys(errors).length === 0;
    },
    [fields],
  );

  const clearError = useCallback((fieldPath: string) => {
    setValidationErrors((prev) =>
      Object.fromEntries(
        Object.entries(prev).filter(([key]) => key !== fieldPath),
      ),
    );
  }, []);

  return {validationErrors, validate, clearError};
}
