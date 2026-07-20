import {settingsSchema} from '@omnicraft/settings-schema';

import {SettingSection} from '../../../components/SettingSection/index.js';
import {ChatLlmSectionFields} from './ChatLlmSectionFields.js';

const llmShape = settingsSchema.shape.llm.unwrap().shape;
const mainShape = llmShape.main.unwrap().shape;
const lightShape = llmShape.light.unwrap().shape;

const FIELDS = [
  {path: 'llm/apiFormat', schema: llmShape.apiFormat},
  {path: 'llm/apiKey', schema: llmShape.apiKey},
  {path: 'llm/baseUrl', schema: llmShape.baseUrl},
  {path: 'llm/main/model', schema: mainShape.model},
  {path: 'llm/main/thinkingLevel', schema: mainShape.thinkingLevel},
  {path: 'llm/main/maxContextTokens', schema: mainShape.maxContextTokens},
  {path: 'llm/main/maxOutputTokens', schema: mainShape.maxOutputTokens},
  {path: 'llm/light/model', schema: lightShape.model},
  {path: 'llm/light/thinkingLevel', schema: lightShape.thinkingLevel},
  {path: 'llm/light/maxContextTokens', schema: lightShape.maxContextTokens},
  {path: 'llm/light/maxOutputTokens', schema: lightShape.maxOutputTokens},
];

export function ChatLlmSection() {
  return (
    <SettingSection title='Chat Agent' fields={FIELDS}>
      {(props) => <ChatLlmSectionFields {...props} />}
    </SettingSection>
  );
}
