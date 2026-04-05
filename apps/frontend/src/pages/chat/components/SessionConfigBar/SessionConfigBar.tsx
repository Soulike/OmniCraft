import {
  Description,
  Label,
  ListBox,
  Select,
  SelectRoot,
  Skeleton,
} from '@heroui/react';
import {useMemo} from 'react';
import {Link} from 'react-router';

import {ROUTES} from '@/routes.js';

import {useSessionConfig} from '../../hooks/useSessionConfig.js';
import styles from './styles.module.css';

export function SessionConfigBar() {
  const {
    allAllowedPathEntriesFromSettings,
    isLoading,
    loadError,
    selectedWorkspace,
    selectedExtraAllowedPaths,
    setSelectedWorkspace,
    setSelectedExtraAllowedPaths,
  } = useSessionConfig();

  const readWritePaths = useMemo(
    () =>
      allAllowedPathEntriesFromSettings.filter((p) => p.mode === 'read-write'),
    [allAllowedPathEntriesFromSettings],
  );

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.dropdowns}>
          <Skeleton className={styles.skeletonRow} />
          <Skeleton className={styles.skeletonRow} />
        </div>
      </div>
    );
  }

  if (loadError || allAllowedPathEntriesFromSettings.length === 0) {
    return (
      <div className={styles.emptyContainer}>
        <Link className={styles.settingsLink} to={ROUTES.settings.fileAccess()}>
          Configure allowed paths in Settings &rarr; File Access
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className={styles.container}>
        <div className={styles.dropdowns}>
          <Select
            className={styles.workspaceSelect}
            value={selectedWorkspace ?? ''}
            onChange={(value) => {
              setSelectedWorkspace(value ? String(value) : undefined);
            }}
          >
            <Label>Workspace</Label>
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Description>Read-write directory the agent works in</Description>
            <Select.Popover>
              <ListBox>
                {readWritePaths.map((entry) => (
                  <ListBox.Item
                    key={entry.path}
                    id={entry.path}
                    textValue={entry.path}
                  >
                    {entry.path}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>

          {allAllowedPathEntriesFromSettings.length > 0 && (
            <SelectRoot<object, 'multiple'>
              className={styles.extraPathsSelect}
              selectionMode='multiple'
              value={selectedExtraAllowedPaths}
              onChange={(value) => {
                setSelectedExtraAllowedPaths(value.map(String));
              }}
            >
              <Label>Extra Allowed Paths</Label>
              <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Description>
                Additional directories the agent may access
              </Description>
              <Select.Popover>
                <ListBox>
                  {allAllowedPathEntriesFromSettings.map((entry) => (
                    <ListBox.Item
                      key={entry.path}
                      id={entry.path}
                      textValue={`${entry.path} (${entry.mode})`}
                    >
                      {entry.path} ({entry.mode})
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </SelectRoot>
          )}
        </div>
      </div>

      <p className={styles.disclaimer}>
        Agent may still access files outside these paths via shell when
        explicitly requested.
      </p>
    </div>
  );
}
