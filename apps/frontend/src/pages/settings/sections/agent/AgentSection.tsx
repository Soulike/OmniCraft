import {settingsSchema} from '@omnicraft/settings-schema';

import {SettingSection} from '../../components/SettingSection/index.js';
import {AgentSectionFields} from './AgentSectionFields.js';

const agentShape = settingsSchema.shape.agent.unwrap().shape;

const FIELDS = [
  {path: 'agent/maxToolRounds', schema: agentShape.maxToolRounds},
];

export function AgentSection() {
  return (
    <SettingSection title='Agent' fields={FIELDS}>
      {(props) => <AgentSectionFields {...props} />}
    </SettingSection>
  );
}
