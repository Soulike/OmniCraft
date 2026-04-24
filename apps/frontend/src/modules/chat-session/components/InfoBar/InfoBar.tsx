import {useChatEventBus} from '../../hooks/useChatEventBus.js';
import {useSessionConfig} from '../../hooks/useSessionConfig.js';
import {InfoBarView} from './InfoBarView.js';

export function InfoBar() {
  const {selectedWorkspace} = useSessionConfig();
  const eventBus = useChatEventBus();

  return (
    <InfoBarView selectedWorkspace={selectedWorkspace} eventBus={eventBus} />
  );
}
