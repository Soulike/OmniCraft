import {useChatEventBus} from '../../hooks/useChatEventBus.js';
import {useSessionConfig} from '../../hooks/useSessionConfig.js';
import {InfoBarView} from './InfoBarView.js';

export function InfoBar() {
  const {selectedWorkspace, selectedExtraAllowedPathEntries} =
    useSessionConfig();
  const eventBus = useChatEventBus();

  return (
    <InfoBarView
      selectedWorkspace={selectedWorkspace}
      selectedExtraAllowedPathEntries={selectedExtraAllowedPathEntries}
      eventBus={eventBus}
    />
  );
}
