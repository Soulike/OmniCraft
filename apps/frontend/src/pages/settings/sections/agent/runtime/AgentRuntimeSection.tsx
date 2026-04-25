import {settingsSchema} from '@omnicraft/settings-schema';

import {SettingSection} from '../../../components/SettingSection/index.js';
import {AgentRuntimeSectionFields} from './AgentRuntimeSectionFields.js';

const agentShape = settingsSchema.shape.agent.unwrap().shape;

const FIELDS = [
  {path: 'agent/maxToolRounds', schema: agentShape.maxToolRounds},
];

export function AgentRuntimeSection() {
  return (
    <SettingSection title='Runtime' fields={FIELDS}>
      {(props) => <AgentRuntimeSectionFields {...props} />}
    </SettingSection>
  );
}
