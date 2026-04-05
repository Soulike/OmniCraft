import type {AllowedPathEntry} from '@omnicraft/settings-schema';
import type {SseUsage} from '@omnicraft/sse-events';

import {AccessInfo} from './components/AccessInfo/index.js';
import {UsageInfo} from './components/UsageInfo/index.js';
import styles from './styles.module.css';

interface InfoBarProps {
  workspace?: string;
  extraPaths?: readonly AllowedPathEntry[];
  warning?: string;
  usage: SseUsage | null;
}

export function InfoBar({workspace, extraPaths, warning, usage}: InfoBarProps) {
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
      {usage && <UsageInfo usage={usage} />}
    </div>
  );
}
