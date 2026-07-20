import {ConnectionFields} from '../../../components/ConnectionFields/index.js';
import {ModelSettingsFields} from '../../../components/ModelSettingsFields/index.js';
import type {SettingSectionRenderProps} from '../../../components/SettingSection/index.js';

export function ChatLlmSectionFields(props: SettingSectionRenderProps) {
  return (
    <>
      <ConnectionFields {...props} prefix='llm' />
      <ModelSettingsFields {...props} prefix='llm/main' title='Main model' />
      <ModelSettingsFields
        {...props}
        prefix='llm/light'
        title='Light model'
        modelPlaceholder='claude-haiku-4-20250514'
        modelDescription='Model for lightweight tasks (e.g. title generation). Falls back to the main model if empty.'
      />
    </>
  );
}
