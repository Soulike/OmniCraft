import {cleanup, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';

import type {SettingFieldValues} from '../SettingSection/index.js';
import {ModelSettingsFields} from './ModelSettingsFields.js';

afterEach(() => {
  cleanup();
});

function renderFields(values: SettingFieldValues) {
  render(
    <ModelSettingsFields
      values={values}
      setValue={vi.fn()}
      validationErrors={{}}
      isDisabled={false}
      prefix='llm/main'
      title='Main model'
    />,
  );
}

describe('ModelSettingsFields', () => {
  const base: SettingFieldValues = {
    'llm/main/model': 'claude-sonnet-4',
    'llm/main/thinkingLevel': 'none',
    'llm/main/maxContextTokens': 200_000,
    'llm/main/maxOutputTokens': 32_000,
  };

  it('renders the group heading', () => {
    renderFields(base);
    expect(screen.getByText('Main model')).toBeInTheDocument();
  });

  it('shows a cross-field error when max output >= max context', () => {
    renderFields({
      ...base,
      'llm/main/maxContextTokens': 100_000,
      'llm/main/maxOutputTokens': 100_000,
    });
    expect(
      screen.getByText('Max output must be less than max context'),
    ).toBeInTheDocument();
  });

  it('does not show the cross-field error when output < context', () => {
    renderFields(base);
    expect(
      screen.queryByText('Max output must be less than max context'),
    ).not.toBeInTheDocument();
  });
});
