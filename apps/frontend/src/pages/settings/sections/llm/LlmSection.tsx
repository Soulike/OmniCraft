import {settingsSchema} from '@omnicraft/settings-schema';

import {SettingSection} from '../../components/SettingSection/index.js';
import {LlmSectionFields} from './LlmSectionFields.js';

const llmShape = settingsSchema.shape.llm.unwrap().shape;

const FIELDS = [
  {path: 'llm/apiFormat', schema: llmShape.apiFormat},
  {path: 'llm/apiKey', schema: llmShape.apiKey},
  {path: 'llm/baseUrl', schema: llmShape.baseUrl},
  {path: 'llm/model', schema: llmShape.model},
];

export function LlmSection() {
  return (
    <SettingSection title='LLM' fields={FIELDS}>
      {(props) => <LlmSectionFields {...props} />}
    </SettingSection>
  );
}
