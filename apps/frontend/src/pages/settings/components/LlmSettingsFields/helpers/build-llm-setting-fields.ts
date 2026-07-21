import {MODEL_TIER_LADDER, settingsSchema} from '@omnicraft/settings-schema';

import type {FieldConfig} from '../../SettingSection/index.js';

/** Builds the SettingSection field list for one LLM settings group. */
export function buildLlmSettingFields(
  prefix: 'llm' | 'codingLlm',
): FieldConfig[] {
  const shape = settingsSchema.shape[prefix].unwrap().shape;
  const fields: FieldConfig[] = [
    {path: `${prefix}/apiFormat`, schema: shape.apiFormat},
    {path: `${prefix}/apiKey`, schema: shape.apiKey},
    {path: `${prefix}/baseUrl`, schema: shape.baseUrl},
    {path: `${prefix}/defaultTier`, schema: shape.defaultTier},
  ];
  for (const tier of MODEL_TIER_LADDER) {
    const tierShape = shape[tier].unwrap().shape;
    fields.push(
      {path: `${prefix}/${tier}/model`, schema: tierShape.model},
      {
        path: `${prefix}/${tier}/thinkingLevel`,
        schema: tierShape.thinkingLevel,
      },
      {
        path: `${prefix}/${tier}/maxContextTokens`,
        schema: tierShape.maxContextTokens,
      },
      {
        path: `${prefix}/${tier}/maxOutputTokens`,
        schema: tierShape.maxOutputTokens,
      },
    );
  }
  return fields;
}
