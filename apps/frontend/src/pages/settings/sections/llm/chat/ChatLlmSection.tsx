import {settingsSchema} from '@omnicraft/settings-schema';

import {SettingSection} from '../../../components/SettingSection/index.js';
import {ChatLlmSectionFields} from './ChatLlmSectionFields.js';

const llmShape = settingsSchema.shape.llm.unwrap().shape;

const FIELDS = [
  {path: 'llm/apiFormat', schema: llmShape.apiFormat},
  {path: 'llm/apiKey', schema: llmShape.apiKey},
  {path: 'llm/baseUrl', schema: llmShape.baseUrl},
  {path: 'llm/model', schema: llmShape.model},
  {path: 'llm/lightModel', schema: llmShape.lightModel},
  {path: 'llm/thinkingLevel', schema: llmShape.thinkingLevel},
];

export function ChatLlmSection() {
  return (
    <SettingSection title='Chat Agent' fields={FIELDS}>
      {(props) => <ChatLlmSectionFields {...props} />}
    </SettingSection>
  );
}
