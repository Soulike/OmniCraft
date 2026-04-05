import {useSessionConfig} from '../../hooks/useSessionConfig.js';
import {useUsage} from './components/UsageInfo/hooks/useUsage.js';
import {InfoBarView} from './InfoBarView.js';

export function InfoBar() {
  const {selectedWorkspace, selectedExtraAllowedPathEntries} =
    useSessionConfig();
  const {usage} = useUsage();

  return (
    <InfoBarView
      selectedWorkspace={selectedWorkspace}
      selectedExtraAllowedPathEntries={selectedExtraAllowedPathEntries}
      usage={usage}
    />
  );
}
