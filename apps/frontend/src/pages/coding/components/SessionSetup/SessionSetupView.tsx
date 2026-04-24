import {Alert} from '@heroui/react';
import {Link} from 'react-router';

import {ROUTES} from '@/routes.js';

import {WorkspaceSelect} from './components/WorkspaceSelect/index.js';
import styles from './styles.module.css';

interface SessionSetupViewProps {
  readonly isLoading: boolean;
  readonly loadError: unknown;
  readonly hasConfiguredWorkspaces: boolean;
  readonly selectedWorkspace: string | undefined;
}

export function SessionSetupView({
  isLoading,
  loadError,
  hasConfiguredWorkspaces,
  selectedWorkspace,
}: SessionSetupViewProps) {
  return (
    <div className={styles.container}>
      <p className={styles.welcomeText}>
        Configure workspace for this session below,
        <br />
        or start chatting right away. 🚀
      </p>

      <div className={styles.dropdowns}>
        <WorkspaceSelect />
      </div>

      {loadError !== null && (
        <Alert status='danger'>
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>
              Failed to load workspaces from settings.
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {!isLoading && !loadError && !hasConfiguredWorkspaces && (
        <Alert status='warning'>
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>
              No workspaces configured.{' '}
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

      {hasConfiguredWorkspaces && !selectedWorkspace && (
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
