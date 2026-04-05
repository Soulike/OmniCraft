import {useMemo} from 'react';

import {useSessionConfig} from '../../hooks/useSessionConfig.js';
import {AccessInfo} from './components/AccessInfo/index.js';
import {UsageInfo} from './components/UsageInfo/index.js';
import styles from './styles.module.css';

export function InfoBar() {
  const {selectedWorkspace, selectedExtraAllowedPathEntries, loadError} =
    useSessionConfig();

  const warning = useMemo(() => {
    if (loadError)
      return loadError instanceof Error
        ? loadError.message
        : 'Failed to load allowed paths';
    if (!selectedWorkspace)
      return 'No workspace selected — agent will have limited file access.';
    return undefined;
  }, [loadError, selectedWorkspace]);

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
      <UsageInfo />
    </div>
  );
}
