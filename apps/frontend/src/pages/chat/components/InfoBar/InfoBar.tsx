import {useMemo} from 'react';

import {useSessionConfig} from '../../hooks/useSessionConfig.js';
import {AccessInfo} from './components/AccessInfo/index.js';
import {UsageInfo} from './components/UsageInfo/index.js';
import styles from './styles.module.css';

export function InfoBar() {
  const {workspace, resolvedExtraPaths, pathsError} = useSessionConfig();

  const warning = useMemo(() => {
    if (pathsError) return `Failed to load allowed paths: ${pathsError}`;
    if (!workspace)
      return 'No workspace selected — agent will have limited file access.';
    return undefined;
  }, [pathsError, workspace]);

  const showAccessInfo = workspace ?? warning;

  return (
    <div className={styles.container}>
      {showAccessInfo && (
        <AccessInfo
          workspace={workspace}
          extraPaths={resolvedExtraPaths}
          warning={warning}
        />
      )}
      <UsageInfo />
    </div>
  );
}
