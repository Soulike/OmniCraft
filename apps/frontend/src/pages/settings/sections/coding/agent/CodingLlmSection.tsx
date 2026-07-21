import {
  buildLlmSettingFields,
  LlmSettingsFields,
} from '../../../components/LlmSettingsFields/index.js';
import {SettingSection} from '../../../components/SettingSection/index.js';

const FIELDS = buildLlmSettingFields('codingLlm');

export function CodingLlmSection() {
  return (
    <SettingSection title='Coding Agent' fields={FIELDS}>
      {(props) => <LlmSettingsFields {...props} prefix='codingLlm' />}
    </SettingSection>
  );
}
