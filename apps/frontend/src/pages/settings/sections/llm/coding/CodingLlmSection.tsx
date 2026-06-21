import {settingsSchema} from '@omnicraft/settings-schema';

import {SettingSection} from '../../../components/SettingSection/index.js';
import {CodingLlmSectionFields} from './CodingLlmSectionFields.js';

const codingLlmShape = settingsSchema.shape.codingLlm.unwrap().shape;

const FIELDS = [
  {path: 'codingLlm/apiFormat', schema: codingLlmShape.apiFormat},
  {path: 'codingLlm/apiKey', schema: codingLlmShape.apiKey},
  {path: 'codingLlm/baseUrl', schema: codingLlmShape.baseUrl},
  {path: 'codingLlm/model', schema: codingLlmShape.model},
  {path: 'codingLlm/lightModel', schema: codingLlmShape.lightModel},
  {path: 'codingLlm/thinkingLevel', schema: codingLlmShape.thinkingLevel},
];

export function CodingLlmSection() {
  return (
    <SettingSection title='Coding Agent' fields={FIELDS}>
      {(props) => <CodingLlmSectionFields {...props} />}
    </SettingSection>
  );
}
