import type {AllowedPathEntry} from '@omnicraft/settings-schema';

import {AccessInfo} from './components/AccessInfo/index.js';
import {UsageInfo} from './components/UsageInfo/index.js';
import styles from './styles.module.css';

interface InfoBarProps {
  workspace?: string;
  extraPaths?: readonly AllowedPathEntry[];
  warning?: string;
}

export function InfoBar({workspace, extraPaths, warning}: InfoBarProps) {
  const showAccessInfo = workspace ?? warning;

  return (
    <div className={styles.container}>
      {showAccessInfo && (
        <AccessInfo
          workspace={workspace}
          extraPaths={extraPaths ?? []}
          warning={warning}
        />
      )}
      <UsageInfo />
    </div>
  );
}
