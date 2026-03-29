import {
  Description,
  FieldError,
  Input,
  Label,
  NumberField,
} from '@heroui/react';

import type {SettingSectionRenderProps} from '../../components/SettingSection/index.js';

export function AgentSectionFields({
  values,
  setValue,
  validationErrors,
  isDisabled,
}: SettingSectionRenderProps) {
  return (
    <NumberField
      value={Number(values['agent/maxToolRounds'])}
      isInvalid={'agent/maxToolRounds' in validationErrors}
      isDisabled={isDisabled}
      minValue={1}
      onChange={(value) => {
        setValue('agent/maxToolRounds', value);
      }}
    >
      <Label>Max Tool Rounds</Label>
      <Input />
      <Description>
        Maximum number of tool execution rounds per user message
      </Description>
      {validationErrors['agent/maxToolRounds'] && (
        <FieldError>{validationErrors['agent/maxToolRounds']}</FieldError>
      )}
    </NumberField>
  );
}
