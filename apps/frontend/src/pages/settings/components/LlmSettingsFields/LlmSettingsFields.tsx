import {Description, FieldError, Label, ListBox, Select} from '@heroui/react';

import {ConnectionFields} from '../ConnectionFields/index.js';
import {ModelSettingsFields} from '../ModelSettingsFields/index.js';
import type {SettingSectionRenderProps} from '../SettingSection/index.js';

interface LlmSettingsFieldsProps extends SettingSectionRenderProps {
  prefix: 'llm' | 'codingLlm';
}

const TIER_META = [
  {
    tier: 'powerful',
    title: 'Powerful model',
    placeholder: 'claude-opus-4-20250514',
    description: 'Most capable tier, for hard multi-step reasoning.',
  },
  {
    tier: 'versatile',
    title: 'Versatile model',
    placeholder: 'claude-sonnet-4-20250514',
    description: 'Balanced default. Leave empty to inherit the default tier.',
  },
  {
    tier: 'lightweight',
    title: 'Lightweight model',
    placeholder: 'claude-haiku-4-20250514',
    description:
      'Cheapest tier for trivial subtasks. Leave empty to inherit the default tier.',
  },
] as const;

const DEFAULT_TIER_OPTIONS = [
  ['powerful', 'Powerful'],
  ['versatile', 'Versatile'],
  ['lightweight', 'Lightweight'],
] as const;

export function LlmSettingsFields(props: LlmSettingsFieldsProps) {
  const {prefix, values, setValue, validationErrors, isDisabled} = props;
  const defaultTierPath = `${prefix}/defaultTier`;
  const defaultTierValue = values[defaultTierPath];
  const defaultTier =
    typeof defaultTierValue === 'string' ? defaultTierValue : 'powerful';

  return (
    <>
      <ConnectionFields {...props} prefix={prefix} />

      <Select
        value={defaultTier}
        isInvalid={defaultTierPath in validationErrors}
        isDisabled={isDisabled}
        onChange={(value) => {
          if (value) {
            setValue(defaultTierPath, String(value));
          }
        }}
      >
        <Label>Default Tier</Label>
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Description>
          The tier the agent runs on; also the fallback for empty tiers.
        </Description>
        <Select.Popover>
          <ListBox>
            {DEFAULT_TIER_OPTIONS.map(([id, label]) => (
              <ListBox.Item key={id} id={id} textValue={label}>
                {label}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
        {validationErrors[defaultTierPath] && (
          <FieldError>{validationErrors[defaultTierPath]}</FieldError>
        )}
      </Select>

      {TIER_META.map(({tier, title, placeholder, description}) => {
        const modelValue = values[`${prefix}/${tier}/model`];
        const modelIsBlank =
          typeof modelValue !== 'string' || modelValue.trim() === '';
        return (
          <ModelSettingsFields
            key={tier}
            {...props}
            prefix={`${prefix}/${tier}`}
            title={title}
            modelPlaceholder={placeholder}
            modelDescription={description}
            modelError={
              tier === defaultTier && modelIsBlank
                ? 'The default tier must have a model'
                : undefined
            }
          />
        );
      })}
    </>
  );
}
