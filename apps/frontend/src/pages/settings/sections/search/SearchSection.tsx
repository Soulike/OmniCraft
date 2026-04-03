import {settingsSchema} from '@omnicraft/settings-schema';

import {SettingSection} from '../../components/SettingSection/index.js';
import {SearchSectionFields} from './SearchSectionFields.js';

const searchShape = settingsSchema.shape.search.unwrap().shape;

const FIELDS = [
  {path: 'search/tavilyApiKey', schema: searchShape.tavilyApiKey},
];

export function SearchSection() {
  return (
    <SettingSection title='Search' fields={FIELDS}>
      {(props) => <SearchSectionFields {...props} />}
    </SettingSection>
  );
}
