import {Alert, Skeleton} from '@heroui/react';
import {Link} from 'react-router';

import {ROUTES} from '@/routes.js';

import {useSessionConfig} from '../../hooks/useSessionConfig.js';
import {ExtraAllowedPathsSelect} from './components/ExtraAllowedPathsSelect/index.js';
import {WorkspaceSelect} from './components/WorkspaceSelect/index.js';
import styles from './styles.module.css';

export function SessionSetup() {
  const {
    allAllowedPathEntriesFromSettings,
    isLoading,
    loadError,
    selectedWorkspace,
  } = useSessionConfig();

  const hasConfiguredPaths =
    !isLoading && !loadError && allAllowedPathEntriesFromSettings.length > 0;

  return (
    <div className={styles.container}>
      <p className={styles.welcomeText}>
        Configure workspace for this session below,
        <br />
        or start chatting right away. 🚀
      </p>

      {isLoading ? (
        <div className={styles.dropdowns}>
          <Skeleton className={styles.skeletonRow} />
          <Skeleton className={styles.skeletonRow} />
        </div>
      ) : hasConfiguredPaths ? (
        <>
          <div className={styles.dropdowns}>
            <WorkspaceSelect />
            <ExtraAllowedPathsSelect />
          </div>

          <p className={styles.disclaimer}>
            Agent may still access files outside these paths via shell when
            explicitly requested.
          </p>
        </>
      ) : (
        <Link className={styles.settingsLink} to={ROUTES.settings.fileAccess()}>
          Configure allowed paths in Settings &rarr; File Access
        </Link>
      )}

      {!isLoading && !selectedWorkspace && (
        <Alert status='warning'>
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>
              No workspace configured for this session.
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}
    </div>
  );
}
