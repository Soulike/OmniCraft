import {render, screen} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';

import type {SettingFieldValues} from '../SettingSection/index.js';
import {ConnectionFields} from './ConnectionFields.js';

describe('ConnectionFields', () => {
  it('renders the connection fields for the given prefix', () => {
    const values: SettingFieldValues = {
      'llm/apiFormat': 'claude',
      'llm/apiKey': 'sk-test',
      'llm/baseUrl': 'https://api.anthropic.com',
    };
    render(
      <ConnectionFields
        values={values}
        setValue={vi.fn()}
        validationErrors={{}}
        isDisabled={false}
        prefix='llm'
      />,
    );
    expect(screen.getByText('API Format')).toBeInTheDocument();
    expect(screen.getByText('API Key')).toBeInTheDocument();
    expect(screen.getByText('Base URL')).toBeInTheDocument();
  });
});
