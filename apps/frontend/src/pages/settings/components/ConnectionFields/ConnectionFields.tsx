import {
  Description,
  FieldError,
  Input,
  Label,
  ListBox,
  Select,
  TextField,
} from '@heroui/react';

import type {SettingSectionRenderProps} from '../SettingSection/index.js';

interface ConnectionFieldsProps extends SettingSectionRenderProps {
  /** Key-path prefix for this section, e.g. 'llm' or 'codingLlm'. */
  prefix: string;
}

export function ConnectionFields({
  values,
  setValue,
  validationErrors,
  isDisabled,
  prefix,
}: ConnectionFieldsProps) {
  const apiFormatPath = `${prefix}/apiFormat`;
  const apiKeyPath = `${prefix}/apiKey`;
  const baseUrlPath = `${prefix}/baseUrl`;

  return (
    <>
      <Select
        value={String(values[apiFormatPath])}
        isInvalid={apiFormatPath in validationErrors}
        isDisabled={isDisabled}
        onChange={(value) => {
          if (value) {
            setValue(apiFormatPath, String(value));
          }
        }}
      >
        <Label>API Format</Label>
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Description>Protocol format for the LLM API</Description>
        <Select.Popover>
          <ListBox>
            <ListBox.Item id='claude' textValue='Claude'>
              Claude
              <ListBox.ItemIndicator />
            </ListBox.Item>
            <ListBox.Item id='openai-responses' textValue='OpenAI Responses'>
              OpenAI Responses
              <ListBox.ItemIndicator />
            </ListBox.Item>
          </ListBox>
        </Select.Popover>
        {validationErrors[apiFormatPath] && (
          <FieldError>{validationErrors[apiFormatPath]}</FieldError>
        )}
      </Select>

      <TextField
        value={String(values[apiKeyPath])}
        isInvalid={apiKeyPath in validationErrors}
        isDisabled={isDisabled}
        onChange={(val) => {
          setValue(apiKeyPath, val);
        }}
        type='password'
      >
        <Label>API Key</Label>
        <Input placeholder='sk-...' />
        <Description>API key for the LLM service</Description>
        {validationErrors[apiKeyPath] && (
          <FieldError>{validationErrors[apiKeyPath]}</FieldError>
        )}
      </TextField>

      <TextField
        value={String(values[baseUrlPath])}
        isInvalid={baseUrlPath in validationErrors}
        isDisabled={isDisabled}
        onChange={(val) => {
          setValue(baseUrlPath, val);
        }}
      >
        <Label>Base URL</Label>
        <Input placeholder='https://api.anthropic.com' type='url' />
        <Description>Base URL of the LLM API</Description>
        {validationErrors[baseUrlPath] && (
          <FieldError>{validationErrors[baseUrlPath]}</FieldError>
        )}
      </TextField>
    </>
  );
}
