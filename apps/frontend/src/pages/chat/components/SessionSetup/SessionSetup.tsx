import {Alert} from '@heroui/react';
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

      <div className={styles.dropdowns}>
        <WorkspaceSelect />
        <ExtraAllowedPathsSelect />
      </div>

      <p className={styles.disclaimer}>
        Agent may still access files outside these paths via shell when
        explicitly requested.
      </p>

      {loadError && (
        <Alert status='danger'>
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>
              Failed to load allowed paths from settings.
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {!isLoading && !loadError && !hasConfiguredPaths && (
        <Alert status='warning'>
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>
              No allowed paths configured.{' '}
              <Link
                className={styles.settingsLink}
                to={ROUTES.settings.fileAccess()}
              >
                Configure in Settings &rarr; File Access
              </Link>
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {hasConfiguredPaths && !selectedWorkspace && (
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
