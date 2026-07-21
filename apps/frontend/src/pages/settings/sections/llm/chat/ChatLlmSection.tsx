import {
  buildLlmSettingFields,
  LlmSettingsFields,
} from '../../../components/LlmSettingsFields/index.js';
import {SettingSection} from '../../../components/SettingSection/index.js';

const FIELDS = buildLlmSettingFields('llm');

export function ChatLlmSection() {
  return (
    <SettingSection title='Chat Agent' fields={FIELDS}>
      {(props) => <LlmSettingsFields {...props} prefix='llm' />}
    </SettingSection>
  );
}
