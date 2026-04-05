import {useMemo} from 'react';

import {useSessionConfig} from '../../hooks/useSessionConfig.js';
import {AccessInfo} from './components/AccessInfo/index.js';
import {useUsage} from './components/UsageInfo/hooks/useUsage.js';
import {UsageInfo} from './components/UsageInfo/index.js';
import styles from './styles.module.css';

export function InfoBar() {
  const {
    allAllowedPathEntriesFromSettings,
    selectedWorkspace,
    selectedExtraAllowedPathEntries,
    loadError,
    isLoading,
  } = useSessionConfig();
  const {usage} = useUsage();

  const hasConfiguredPaths =
    !isLoading && !loadError && allAllowedPathEntriesFromSettings.length > 0;

  const warning = useMemo(() => {
    if (!hasConfiguredPaths) return undefined;
    if (!selectedWorkspace)
      return 'No workspace selected — agent will have limited file access.';
    return undefined;
  }, [hasConfiguredPaths, selectedWorkspace]);

  const showAccessInfo = selectedWorkspace ?? warning;

  return (
    <div className={styles.container}>
      {showAccessInfo && (
        <AccessInfo
          workspace={selectedWorkspace}
          extraPaths={selectedExtraAllowedPathEntries}
          warning={warning}
        />
      )}
      {usage && <UsageInfo usage={usage} />}
    </div>
  );
}
