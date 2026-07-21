import {cleanup, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';

import type {SettingFieldValues} from '../SettingSection/index.js';
import {LlmSettingsFields} from './LlmSettingsFields.js';

afterEach(() => {
  cleanup();
});

function renderFields(values: SettingFieldValues) {
  render(
    <LlmSettingsFields
      prefix='llm'
      values={values}
      setValue={vi.fn()}
      validationErrors={{}}
      isDisabled={false}
    />,
  );
}

describe('LlmSettingsFields', () => {
  const base: SettingFieldValues = {
    'llm/defaultTier': 'powerful',
    'llm/powerful/model': 'opus',
    'llm/versatile/model': '',
    'llm/lightweight/model': '',
  };

  it('renders all three tier headings', () => {
    renderFields(base);
    expect(screen.getByText('Powerful model')).toBeInTheDocument();
    expect(screen.getByText('Versatile model')).toBeInTheDocument();
    expect(screen.getByText('Lightweight model')).toBeInTheDocument();
  });

  it('flags a blank model on the selected default tier', () => {
    renderFields({...base, 'llm/powerful/model': ''});
    expect(
      screen.getByText('The default tier must have a model'),
    ).toBeInTheDocument();
  });
});
