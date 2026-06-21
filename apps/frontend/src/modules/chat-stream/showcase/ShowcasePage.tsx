import {useSubagentEventBus} from './hooks/useSubagentEventBus.js';
import {ShowcasePageView} from './ShowcasePageView.js';

export function ShowcasePage() {
  const subagentEventBus = useSubagentEventBus();

  return <ShowcasePageView subagentEventBus={subagentEventBus} />;
}
