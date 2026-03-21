import {toast} from '@heroui/react';
import {type ReactNode, useCallback} from 'react';

import {useSettingSave} from './hooks/useSettingSave.js';
import {useSettingValidation} from './hooks/useSettingValidation.js';
import {useSettingValues} from './hooks/useSettingValues.js';
import {SettingSectionView} from './SettingSectionView.js';
import type {FieldConfig, SettingSectionRenderProps} from './types.js';

interface SettingSectionProps {
  title: string;
  fields: FieldConfig[];
  children: (props: SettingSectionRenderProps) => ReactNode;
}

export function SettingSection({title, fields, children}: SettingSectionProps) {
  const {values, updateValue, isLoading, loadError, reload} =
    useSettingValues(fields);
  const {validationErrors, validate, clearError} = useSettingValidation(fields);
  const {isSaving, save} = useSettingSave(fields);

  const setValue = useCallback(
    (fieldPath: string, value: unknown) => {
      updateValue(fieldPath, value);
      clearError(fieldPath);
    },
    [updateValue, clearError],
  );

  const handleSave = useCallback(async () => {
    if (!validate(values)) {
      toast.danger('Please fix the errors before saving');
      return;
    }
    await save(values);
  }, [validate, save, values]);

  const isDisabled = isLoading || isSaving;

  return (
    <SettingSectionView
      title={title}
      isLoading={isLoading}
      loadError={loadError}
      isSaving={isSaving}
      onSave={() => {
        void handleSave();
      }}
      onRetry={() => {
        void reload();
      }}
    >
      {children({values, setValue, validationErrors, isDisabled})}
    </SettingSectionView>
  );
}
