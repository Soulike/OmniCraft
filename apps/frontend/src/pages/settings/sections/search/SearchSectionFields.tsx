import {Description, FieldError, Input, Label, TextField} from '@heroui/react';

import type {SettingSectionRenderProps} from '../../components/SettingSection/index.js';

export function SearchSectionFields({
  values,
  setValue,
  validationErrors,
  isDisabled,
}: SettingSectionRenderProps) {
  return (
    <TextField
      value={String(values['search/tavilyApiKey'])}
      isInvalid={'search/tavilyApiKey' in validationErrors}
      isDisabled={isDisabled}
      onChange={(val) => {
        setValue('search/tavilyApiKey', val);
      }}
      type='password'
    >
      <Label>Tavily API Key</Label>
      <Input placeholder='tvly-...' />
      <Description>
        API key for Tavily search service. Get one at tavily.com.
      </Description>
      {validationErrors['search/tavilyApiKey'] && (
        <FieldError>{validationErrors['search/tavilyApiKey']}</FieldError>
      )}
    </TextField>
  );
}
