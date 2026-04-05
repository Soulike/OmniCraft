import {useSessionConfig} from '../../hooks/useSessionConfig.js';
import {AccessInfo} from './components/AccessInfo/index.js';
import {useUsage} from './components/UsageInfo/hooks/useUsage.js';
import {UsageInfo} from './components/UsageInfo/index.js';
import styles from './styles.module.css';

export function InfoBar() {
  const {selectedWorkspace, selectedExtraAllowedPathEntries} =
    useSessionConfig();
  const {usage} = useUsage();

  return (
    <div className={styles.container}>
      {selectedWorkspace && (
        <AccessInfo
          workspace={selectedWorkspace}
          extraPaths={selectedExtraAllowedPathEntries}
        />
      )}
      {usage && <UsageInfo usage={usage} />}
    </div>
  );
}
