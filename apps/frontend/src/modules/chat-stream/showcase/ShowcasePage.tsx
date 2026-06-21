import {useState} from 'react';

import {makeSubagentEventBus} from './mock-data.js';
import {ShowcasePageView} from './ShowcasePageView.js';

export function ShowcasePage() {
  const [subagentEventBus] = useState(makeSubagentEventBus);

  return <ShowcasePageView subagentEventBus={subagentEventBus} />;
}
