import {useChatEventBus} from '../../hooks/useChatEventBus.js';
import {useSessionConfig} from '../../hooks/useSessionConfig.js';
import {useUsage} from '../../hooks/useUsage.js';
import {InfoBarView} from './InfoBarView.js';

export function InfoBar() {
  const {selectedWorkspace, selectedExtraAllowedPathEntries} =
    useSessionConfig();
  const eventBus = useChatEventBus();
  const {usage} = useUsage(eventBus);

  return (
    <InfoBarView
      selectedWorkspace={selectedWorkspace}
      selectedExtraAllowedPathEntries={selectedExtraAllowedPathEntries}
      usage={usage}
    />
  );
}
