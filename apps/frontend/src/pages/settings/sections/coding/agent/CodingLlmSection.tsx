import {settingsSchema} from '@omnicraft/settings-schema';

import {SettingSection} from '../../../components/SettingSection/index.js';
import {CodingLlmSectionFields} from './CodingLlmSectionFields.js';

const codingLlmShape = settingsSchema.shape.codingLlm.unwrap().shape;
const mainShape = codingLlmShape.main.unwrap().shape;
const lightShape = codingLlmShape.light.unwrap().shape;

const FIELDS = [
  {path: 'codingLlm/apiFormat', schema: codingLlmShape.apiFormat},
  {path: 'codingLlm/apiKey', schema: codingLlmShape.apiKey},
  {path: 'codingLlm/baseUrl', schema: codingLlmShape.baseUrl},
  {path: 'codingLlm/main/model', schema: mainShape.model},
  {path: 'codingLlm/main/thinkingLevel', schema: mainShape.thinkingLevel},
  {path: 'codingLlm/main/maxContextTokens', schema: mainShape.maxContextTokens},
  {path: 'codingLlm/main/maxOutputTokens', schema: mainShape.maxOutputTokens},
  {path: 'codingLlm/light/model', schema: lightShape.model},
  {path: 'codingLlm/light/thinkingLevel', schema: lightShape.thinkingLevel},
  {
    path: 'codingLlm/light/maxContextTokens',
    schema: lightShape.maxContextTokens,
  },
  {path: 'codingLlm/light/maxOutputTokens', schema: lightShape.maxOutputTokens},
];

export function CodingLlmSection() {
  return (
    <SettingSection title='Coding Agent' fields={FIELDS}>
      {(props) => <CodingLlmSectionFields {...props} />}
    </SettingSection>
  );
}
