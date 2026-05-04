import {
  Description,
  FieldError,
  Input,
  Label,
  ListBox,
  Select,
  TextField,
} from '@heroui/react';

import type {SettingSectionRenderProps} from '../../../components/SettingSection/index.js';

export function CodingLlmSectionFields({
  values,
  setValue,
  validationErrors,
  isDisabled,
}: SettingSectionRenderProps) {
  return (
    <>
      <Select
        value={String(values['codingLlm/apiFormat'])}
        isInvalid={'codingLlm/apiFormat' in validationErrors}
        isDisabled={isDisabled}
        onChange={(value) => {
          if (value) {
            setValue('codingLlm/apiFormat', String(value));
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
        {validationErrors['codingLlm/apiFormat'] && (
          <FieldError>{validationErrors['codingLlm/apiFormat']}</FieldError>
        )}
      </Select>

      <TextField
        value={String(values['codingLlm/apiKey'])}
        isInvalid={'codingLlm/apiKey' in validationErrors}
        isDisabled={isDisabled}
        onChange={(val) => {
          setValue('codingLlm/apiKey', val);
        }}
        type='password'
      >
        <Label>API Key</Label>
        <Input placeholder='sk-...' />
        <Description>API key for the LLM service</Description>
        {validationErrors['codingLlm/apiKey'] && (
          <FieldError>{validationErrors['codingLlm/apiKey']}</FieldError>
        )}
      </TextField>

      <TextField
        value={String(values['codingLlm/baseUrl'])}
        isInvalid={'codingLlm/baseUrl' in validationErrors}
        isDisabled={isDisabled}
        onChange={(val) => {
          setValue('codingLlm/baseUrl', val);
        }}
      >
        <Label>Base URL</Label>
        <Input placeholder='https://api.anthropic.com' type='url' />
        <Description>Base URL of the LLM API</Description>
        {validationErrors['codingLlm/baseUrl'] && (
          <FieldError>{validationErrors['codingLlm/baseUrl']}</FieldError>
        )}
      </TextField>

      <TextField
        value={String(values['codingLlm/model'])}
        isInvalid={'codingLlm/model' in validationErrors}
        isDisabled={isDisabled}
        onChange={(val) => {
          setValue('codingLlm/model', val);
        }}
      >
        <Label>Model</Label>
        <Input placeholder='claude-sonnet-4-20250514' />
        <Description>Model name to use</Description>
        {validationErrors['codingLlm/model'] && (
          <FieldError>{validationErrors['codingLlm/model']}</FieldError>
        )}
      </TextField>

      <TextField
        value={String(values['codingLlm/lightModel'])}
        isInvalid={'codingLlm/lightModel' in validationErrors}
        isDisabled={isDisabled}
        onChange={(val) => {
          setValue('codingLlm/lightModel', val);
        }}
      >
        <Label>Light Model</Label>
        <Input placeholder='claude-haiku-4-20250514' />
        <Description>
          Model for lightweight tasks (e.g. title generation). Falls back to the
          main model if empty.
        </Description>
        {validationErrors['codingLlm/lightModel'] && (
          <FieldError>{validationErrors['codingLlm/lightModel']}</FieldError>
        )}
      </TextField>
    </>
  );
}
