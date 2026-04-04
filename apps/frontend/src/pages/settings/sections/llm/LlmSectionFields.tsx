import {
  Description,
  FieldError,
  Input,
  Label,
  ListBox,
  Select,
  TextField,
} from '@heroui/react';

import type {SettingSectionRenderProps} from '../../components/SettingSection/index.js';

export function LlmSectionFields({
  values,
  setValue,
  validationErrors,
  isDisabled,
}: SettingSectionRenderProps) {
  return (
    <>
      <Select
        value={String(values['llm/apiFormat'])}
        isInvalid={'llm/apiFormat' in validationErrors}
        isDisabled={isDisabled}
        onChange={(value) => {
          if (value) {
            setValue('llm/apiFormat', String(value));
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
            <ListBox.Item id='openai' textValue='OpenAI Completions'>
              OpenAI Completions
              <ListBox.ItemIndicator />
            </ListBox.Item>
            <ListBox.Item id='openai-responses' textValue='OpenAI Responses'>
              OpenAI Responses
              <ListBox.ItemIndicator />
            </ListBox.Item>
          </ListBox>
        </Select.Popover>
        {validationErrors['llm/apiFormat'] && (
          <FieldError>{validationErrors['llm/apiFormat']}</FieldError>
        )}
      </Select>

      <TextField
        value={String(values['llm/apiKey'])}
        isInvalid={'llm/apiKey' in validationErrors}
        isDisabled={isDisabled}
        onChange={(val) => {
          setValue('llm/apiKey', val);
        }}
        type='password'
      >
        <Label>API Key</Label>
        <Input placeholder='sk-...' />
        <Description>API key for the LLM service</Description>
        {validationErrors['llm/apiKey'] && (
          <FieldError>{validationErrors['llm/apiKey']}</FieldError>
        )}
      </TextField>

      <TextField
        value={String(values['llm/baseUrl'])}
        isInvalid={'llm/baseUrl' in validationErrors}
        isDisabled={isDisabled}
        onChange={(val) => {
          setValue('llm/baseUrl', val);
        }}
      >
        <Label>Base URL</Label>
        <Input placeholder='https://api.anthropic.com' type='url' />
        <Description>Base URL of the LLM API</Description>
        {validationErrors['llm/baseUrl'] && (
          <FieldError>{validationErrors['llm/baseUrl']}</FieldError>
        )}
      </TextField>

      <TextField
        value={String(values['llm/model'])}
        isInvalid={'llm/model' in validationErrors}
        isDisabled={isDisabled}
        onChange={(val) => {
          setValue('llm/model', val);
        }}
      >
        <Label>Model</Label>
        <Input placeholder='claude-sonnet-4-20250514' />
        <Description>Model name to use</Description>
        {validationErrors['llm/model'] && (
          <FieldError>{validationErrors['llm/model']}</FieldError>
        )}
      </TextField>

      <TextField
        value={String(values['llm/lightModel'])}
        isInvalid={'llm/lightModel' in validationErrors}
        isDisabled={isDisabled}
        onChange={(val) => {
          setValue('llm/lightModel', val);
        }}
      >
        <Label>Light Model</Label>
        <Input placeholder='claude-haiku-4-20250514' />
        <Description>
          Model for lightweight tasks (e.g. title generation). Falls back to the
          main model if empty.
        </Description>
        {validationErrors['llm/lightModel'] && (
          <FieldError>{validationErrors['llm/lightModel']}</FieldError>
        )}
      </TextField>
    </>
  );
}
