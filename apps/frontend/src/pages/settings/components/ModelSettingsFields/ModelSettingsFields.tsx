import {
  Description,
  FieldError,
  Input,
  Label,
  ListBox,
  NumberField,
  Select,
  TextField,
} from '@heroui/react';

import {THINKING_LEVELS} from '@/helpers/thinking-level-labels.js';

import type {SettingSectionRenderProps} from '../SettingSection/index.js';
import {toNumberFieldValue} from './helpers/to-number-field-value.js';
import styles from './styles.module.css';

interface ModelSettingsFieldsProps extends SettingSectionRenderProps {
  /** Key-path prefix for this model's fields, e.g. 'llm/powerful'. */
  prefix: string;
  /** Group heading shown above the fields. */
  title: string;
  /** Description under the model-name field. */
  modelDescription?: string;
  /** Placeholder for the model-name field. */
  modelPlaceholder?: string;
  /** Extra error to show on the model-name field alongside validation errors. */
  modelError?: string;
}

export function ModelSettingsFields({
  values,
  setValue,
  validationErrors,
  isDisabled,
  prefix,
  title,
  modelDescription = 'Model name to use',
  modelPlaceholder = 'claude-sonnet-4-20250514',
  modelError,
}: ModelSettingsFieldsProps) {
  const modelPath = `${prefix}/model`;
  const thinkingLevelPath = `${prefix}/thinkingLevel`;
  const maxContextPath = `${prefix}/maxContextTokens`;
  const maxOutputPath = `${prefix}/maxOutputTokens`;

  const modelFieldError = validationErrors[modelPath] ?? modelError;

  const maxContext = toNumberFieldValue(values[maxContextPath]);
  const maxOutput = toNumberFieldValue(values[maxOutputPath]);
  const outputExceedsContext =
    maxContext !== undefined &&
    maxOutput !== undefined &&
    maxOutput >= maxContext;

  const maxOutputError =
    validationErrors[maxOutputPath] ??
    (outputExceedsContext
      ? 'Max output must be less than max context'
      : undefined);

  return (
    <div className={styles.group}>
      <h3 className={styles.heading}>{title}</h3>

      <TextField
        value={typeof values[modelPath] === 'string' ? values[modelPath] : ''}
        isInvalid={modelPath in validationErrors || modelError !== undefined}
        isDisabled={isDisabled}
        onChange={(val) => {
          setValue(modelPath, val);
        }}
      >
        <Label>Model</Label>
        <Input placeholder={modelPlaceholder} />
        <Description>{modelDescription}</Description>
        {modelFieldError && <FieldError>{modelFieldError}</FieldError>}
      </TextField>

      <Select
        value={String(values[thinkingLevelPath])}
        isInvalid={thinkingLevelPath in validationErrors}
        isDisabled={isDisabled}
        onChange={(value) => {
          if (value) {
            setValue(thinkingLevelPath, String(value));
          }
        }}
      >
        <Label>Thinking Level</Label>
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Description>Extended-thinking effort for this model</Description>
        <Select.Popover>
          <ListBox>
            {THINKING_LEVELS.map(([id, label]) => (
              <ListBox.Item key={id} id={id} textValue={label}>
                {label}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
        {validationErrors[thinkingLevelPath] && (
          <FieldError>{validationErrors[thinkingLevelPath]}</FieldError>
        )}
      </Select>

      <NumberField
        value={maxContext}
        isInvalid={maxContextPath in validationErrors}
        isDisabled={isDisabled}
        minValue={1}
        onChange={(value) => {
          if (typeof value === 'number' && Number.isFinite(value)) {
            setValue(maxContextPath, value);
          }
        }}
      >
        <Label>Max Context</Label>
        <Input />
        <Description>
          Full context window in tokens (prompt + output)
        </Description>
        {validationErrors[maxContextPath] && (
          <FieldError>{validationErrors[maxContextPath]}</FieldError>
        )}
      </NumberField>

      <NumberField
        value={maxOutput}
        isInvalid={maxOutputPath in validationErrors || outputExceedsContext}
        isDisabled={isDisabled}
        minValue={1}
        onChange={(value) => {
          if (typeof value === 'number' && Number.isFinite(value)) {
            setValue(maxOutputPath, value);
          }
        }}
      >
        <Label>Max Output</Label>
        <Input />
        <Description>Max output tokens per response</Description>
        {maxOutputError && <FieldError>{maxOutputError}</FieldError>}
      </NumberField>
    </div>
  );
}
