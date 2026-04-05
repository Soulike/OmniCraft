import type {AllowedPathEntry} from '@omnicraft/settings-schema';
import type {SseUsage} from '@omnicraft/sse-events';

import {AccessInfo} from './components/AccessInfo/index.js';
import {UsageInfo} from './components/UsageInfo/index.js';
import styles from './styles.module.css';

interface InfoBarProps {
  workspace?: string;
  extraPaths?: readonly AllowedPathEntry[];
  usage: SseUsage | null;
}

export function InfoBar({workspace, extraPaths, usage}: InfoBarProps) {
  return (
    <div className={styles.container}>
      {workspace && (
        <AccessInfo workspace={workspace} extraPaths={extraPaths ?? []} />
      )}
      {usage && <UsageInfo usage={usage} />}
    </div>
  );
}
