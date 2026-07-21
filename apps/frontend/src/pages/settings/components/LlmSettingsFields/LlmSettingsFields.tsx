import {Description, FieldError, Label, ListBox, Select} from '@heroui/react';
import {MODEL_TIER_LADDER, type ModelTier} from '@omnicraft/settings-schema';

import {ConnectionFields} from '../ConnectionFields/index.js';
import {ModelSettingsFields} from '../ModelSettingsFields/index.js';
import type {SettingSectionRenderProps} from '../SettingSection/index.js';

interface LlmSettingsFieldsProps extends SettingSectionRenderProps {
  prefix: 'llm' | 'codingLlm';
}

/**
 * UI-only copy per tier. Keyed by `ModelTier` so the schema stays the single
 * source of truth for which tiers exist — adding or renaming a tier is a
 * compile error here rather than silent drift.
 */
const TIER_PRESENTATION = {
  powerful: {
    placeholder: 'claude-opus-4-20250514',
    description: 'Most capable tier, for hard multi-step reasoning.',
  },
  versatile: {
    placeholder: 'claude-sonnet-4-20250514',
    description: 'Balanced default. Leave empty to inherit the default tier.',
  },
  lightweight: {
    placeholder: 'claude-haiku-4-20250514',
    description:
      'Cheapest tier for trivial subtasks. Leave empty to inherit the default tier.',
  },
} as const satisfies Record<
  ModelTier,
  {placeholder: string; description: string}
>;

/** Most-capable first — the reverse of the schema's low→high ladder. */
const TIER_DISPLAY_ORDER: readonly ModelTier[] = [
  ...MODEL_TIER_LADDER,
].reverse();

function tierLabel(tier: ModelTier): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

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
            {TIER_DISPLAY_ORDER.map((tier) => (
              <ListBox.Item key={tier} id={tier} textValue={tierLabel(tier)}>
                {tierLabel(tier)}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
        {validationErrors[defaultTierPath] && (
          <FieldError>{validationErrors[defaultTierPath]}</FieldError>
        )}
      </Select>

      {TIER_DISPLAY_ORDER.map((tier) => {
        const {placeholder, description} = TIER_PRESENTATION[tier];
        const modelValue = values[`${prefix}/${tier}/model`];
        const modelIsBlank =
          typeof modelValue !== 'string' || modelValue.trim() === '';
        return (
          <ModelSettingsFields
            key={tier}
            {...props}
            prefix={`${prefix}/${tier}`}
            title={`${tierLabel(tier)} model`}
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
